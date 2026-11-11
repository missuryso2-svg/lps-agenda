"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#faf8f4",
          color: "#242220",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
          padding: "24px",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "32rem",
            border: "1px solid #e4e0d8",
            borderRadius: "24px",
            background: "#ffffff",
            padding: "36px",
            textAlign: "center",
            boxShadow: "0 30px 60px -40px rgba(35, 30, 22, 0.25)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "10px",
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "#a8843c",
              fontWeight: 600,
            }}
          >
            LPS Agenda
          </p>
          <h1
            style={{
              margin: "12px 0 0",
              fontSize: "30px",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            Não foi possível renderizar a aplicação.
          </h1>
          <p
            style={{
              margin: "14px 0 0",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#6b655d",
            }}
          >
            Um erro crítico interrompeu o carregamento. Tente novamente; se
            persistir, confira os logs do servidor.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "12px 0 0",
                fontSize: "10px",
                color: "#8a8378",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              Referência: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              border: 0,
              borderRadius: "12px",
              background: "#242220",
              color: "#faf8f4",
              padding: "12px 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
