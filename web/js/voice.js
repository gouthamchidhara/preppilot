// Browser speech APIs. Recognition: Chrome, Edge, Safari (not Firefox; not in iOS WKWebView).
// Synthesis works almost everywhere. Native apps can swap in a Capacitor speech plugin later.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voice = {
  canListen: !!Recognition,
  canSpeak: 'speechSynthesis' in window,

  listen({ onInterim } = {}) {
    return new Promise((resolve, reject) => {
      if (!Recognition) return reject(new Error('Voice input is not supported in this browser. Try Chrome, Edge or Safari.'));
      const r = new Recognition();
      r.lang = navigator.language || 'en-US';
      r.interimResults = true;
      r.maxAlternatives = 1;
      let finalText = '';
      r.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t; else interim += t;
        }
        onInterim?.(finalText + interim);
      };
      r.onerror = e => reject(new Error(e.error === 'not-allowed' ? 'Microphone permission denied.' : `Voice error: ${e.error}`));
      r.onend = () => resolve(finalText.trim());
      voice._active = r;
      r.start();
    });
  },

  stopListening() { voice._active?.stop(); },

  speak(text) {
    if (!voice.canSpeak || !text) return;
    speechSynthesis.cancel();
    const clean = text.replace(/```[\s\S]*?```/g, ' (see the code on screen) ').replace(/[`*#_>]/g, '');
    const u = new SpeechSynthesisUtterance(clean.slice(0, 1500));
    u.lang = navigator.language || 'en-US';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  },

  stopSpeaking() { if (voice.canSpeak) speechSynthesis.cancel(); },
};
