import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { pngChunk, uploadImages } from "./fixtures/upload-images.mjs";

const state = vi.hoisted(() => ({
  info: vi.fn(),
  input: vi.fn(),
  output: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { UPLOAD_IMAGES: { info: state.info, input: state.input } } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ getAppUrl: () => "https://agenda.example" }));
vi.mock("@/lib/auth/dal", () => ({
  getActiveDashboardContext: async () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    active: { role: "owner", barbershop: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { avatar_url: "known/previous.webp" } }),
    };
    return { from: () => query };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: state.rpc, storage: { from: () => ({ upload: state.upload, remove: state.remove }) } }),
}));
vi.mock("@/lib/security/upload-limit", () => ({ limitImageMutation: async () => null }));

import { POST } from "@/app/api/equipe/foto/[id]/route";
import { processUploadImage, ImageDecoderUnavailable, type ImageProfile } from "@/lib/security/image-decoder";

const profile: ImageProfile = { fit: "inside", side: 1200, maxOutputBytes: 2 * 1024 * 1024, quality: [84, 76] };
const fixture = () => sharp({ create: { width: 16, height: 12, channels: 3, background: "blue" } });
const photoRequest = (body: Uint8Array<ArrayBuffer>) => POST(new Request("https://agenda.example/photo", {
  method: "POST",
  body,
  headers: { origin: "https://agenda.example", "x-photo-version": "known%2Fprevious.webp", "content-type": "image/png" },
}), { params: Promise.resolve({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }) });

beforeEach(() => {
  vi.stubEnv("LPS_IMAGE_PROCESSOR", "cloudflare");
  vi.resetAllMocks();
  state.info.mockResolvedValue({ format: "image/png", width: 16, height: 12 });
  state.input.mockReturnValue({ transform: () => ({ output: state.output }) });
});
afterEach(() => vi.unstubAllEnvs());

function codecResponse(bytes: Uint8Array, type = "image/webp") {
  return { response: () => new Response(new Uint8Array(bytes), { headers: { "Content-Type": type } }) };
}

describe("Cloudflare image processing", () => {
  it("rejects structural corruption, animation and excess before the binding", async () => {
    const { png, jpeg, webp, animatedWebp, oversizedPixels, brokenPng } = await uploadImages();
    const acTL = Buffer.alloc(8);
    acTL.writeUInt32BE(2);
    for (const [bytes, mime] of [
      [brokenPng, "image/png"], [jpeg.subarray(0, jpeg.length - 1), "image/jpeg"],
      [Buffer.concat([jpeg, Buffer.from("trailing")]), "image/jpeg"],
      [webp.subarray(0, webp.length - 3), "image/webp"], [animatedWebp, "image/webp"],
      [Buffer.concat([png.subarray(0, 33), pngChunk("acTL", acTL), png.subarray(33)]), "image/png"],
      [oversizedPixels, "image/png"], [Buffer.alloc(2 * 1024 * 1024 + 1), "image/png"], [png, "image/jpeg"],
    ] as const) {
      await expect(processUploadImage(bytes, mime, profile)).rejects.toThrow("Imagem inválida");
    }
    expect(state.info).not.toHaveBeenCalled();
    expect(state.output).not.toHaveBeenCalled();
  });

  it("cross-checks decoded input metadata and rejects a mislabeled or corrupted response", async () => {
    const png = await fixture().png().toBuffer();
    const webp = await fixture().webp().toBuffer();
    state.info.mockResolvedValueOnce({ format: "image/jpeg", width: 16, height: 12 });
    await expect(processUploadImage(png, "image/png", profile)).rejects.toThrow("Imagem inválida");
    expect(state.output).not.toHaveBeenCalled();

    state.output.mockResolvedValueOnce(codecResponse(png))
      .mockResolvedValueOnce(codecResponse(webp.subarray(0, 24)))
      .mockResolvedValueOnce(codecResponse(webp, "image/png"));
    for (let i = 0; i < 3; i++)
      await expect(processUploadImage(png, "image/png", profile)).rejects.toBeInstanceOf(ImageDecoderUnavailable);
  });

  it("strips emitted EXIF and rejects oversize streams without persisting a partial result", async () => {
    const png = await fixture().png().toBuffer();
    const webp = await fixture().webp().withMetadata({ orientation: 1 }).toBuffer();
    expect((await sharp(webp).metadata()).exif).toBeDefined();
    const oversize = { response: () => new Response(new Uint8Array(profile.maxOutputBytes + 1), {
      headers: { "Content-Type": "image/webp" },
    }) };
    state.output.mockResolvedValueOnce(oversize).mockResolvedValueOnce(codecResponse(webp));
    const output = await processUploadImage(png, "image/png", profile);
    expect(state.output).toHaveBeenCalledTimes(2);
    expect(await sharp(output).metadata()).toMatchObject({ format: "webp", width: 16, height: 12 });
    expect((await sharp(output).metadata()).exif).toBeUndefined();
  });

  it("preserves the photo reference and never enters Storage when quota is exhausted", async () => {
    state.output.mockRejectedValue({ code: 9422 });
    expect((await photoRequest(new Uint8Array(await fixture().png().toBuffer()))).status).toBe(503);
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("never changes the stored photo reference when the upload fails", async () => {
    state.output.mockResolvedValue(codecResponse(await fixture().webp().toBuffer()));
    state.upload.mockResolvedValue({ error: { statusCode: 503 } });
    expect((await photoRequest(new Uint8Array(await fixture().png().toBuffer()))).status).toBe(503);
    expect(state.upload).toHaveBeenCalledOnce();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });
});
