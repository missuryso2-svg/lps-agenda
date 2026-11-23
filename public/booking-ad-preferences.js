// Local adapter only. The certified CMP must be integrated separately before
// ADSENSE_CMP_READY can be enabled. This file never loads a CMP or ad script
// automatically.
(() => {
  const panel = document.getElementById("preferences");
  const area = document.getElementById("advertising");
  if (
    navigator.globalPrivacyControl === true ||
    !panel ||
    !area ||
    self !== top ||
    location.origin !== panel.dataset.origin ||
    location.pathname !== panel.dataset.page ||
    location.search ||
    location.hash ||
    document.referrer
  ) {
    return;
  }

  const choose = document.getElementById("choose");
  const decline = document.getElementById("decline");
  const status = document.getElementById("choice-status");
  const { publisher, slot, cmp } = panel.dataset;
  let listening = false;
  let requested = false;
  let optedIn = false;
  panel.hidden = false;

  function disable() {
    optedIn = false;
    if (requested) { area.hidden = true; location.reload(); return; }
    status.textContent = "Publicidade desligada.";
  }

  function requestAd() {
    if (
      requested ||
      !optedIn ||
      !/^[1-9]\d{0,3}$/.test(cmp) ||
      !/^ca-pub-(?!0{16}$)\d{16}$/.test(publisher) ||
      !/^(?!0{10}$)\d{10}$/.test(slot) ||
      document.documentElement.clientWidth < 280
    ) {
      return;
    }

    requested = true;
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + publisher;
    script.onerror = () => {
      area.hidden = true;
      requested = false;
      status.textContent = "Publicidade indisponível. Você pode continuar sem anúncios.";
    };
    script.onload = () => {
      if (!optedIn) {
        area.hidden = true;
        return;
      }

      const unit = document.createElement("ins");
      unit.className = "adsbygoogle";
      unit.dataset.adClient = publisher;
      unit.dataset.adSlot = slot;
      unit.dataset.adFormat = "auto";
      unit.dataset.fullWidthResponsive = "true";
      unit.style.display = "block";
      area.replaceChildren(document.createTextNode("Publicidade"), document.createElement("br"), unit);
      area.hidden = false;
      const observer = new MutationObserver(() => {
        if (unit.dataset.adStatus === "unfilled") { area.hidden = true; observer.disconnect(); }
      });
      observer.observe(unit, {attributes:true,attributeFilter:["data-ad-status"]});
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch {
        observer.disconnect();
        area.hidden = true;
        status.textContent = "Publicidade indisponível. Você pode continuar sem anúncios.";
      }
    };
    document.head.append(script);
  }

  function openChoices() {
    if (typeof window.__tcfapi !== "function" || typeof window.lpsOpenAdPreferences !== "function") {
      optedIn = false;
      status.textContent = "A plataforma de consentimento não está disponível. Publicidade desligada.";
      return;
    }

    if (!listening) {
      listening = true;
      window.__tcfapi("addEventListener", 2, (tc, success) => {
        const granted = success && tc?.cmpStatus === "loaded" && tc.cmpId === Number(cmp) &&
          typeof tc.tcString === "string" && tc.tcString.length > 0 && tc.vendor?.consents?.[755] === true &&
          [1,2,3,4,7,9,10].every(id => tc.purpose?.consents?.[id] === true && [undefined,1].includes(tc.publisher?.restrictions?.[id]?.[755]));
        if (!granted) { if (requested) disable(); return; }
        if (optedIn && tc.eventStatus === "useractioncomplete") requestAd();
      });
    }

    window.lpsOpenAdPreferences();
  }

  decline.addEventListener("click", disable);
  choose.addEventListener("click", () => {
    optedIn = true;
    openChoices();
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted && (requested || listening)) location.reload();
  });
})();
