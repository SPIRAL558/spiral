/* ==========================================================================
   SPIRAL AI — Chat Client Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const chatWindow = document.getElementById('chat-window');
  const emptyHint = document.getElementById('empty-hint');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const clearBtn = document.getElementById('clear-chat');

  const AVATAR_URL = "https://cdn.discordapp.com/attachments/1504467247106883686/1519704175196504205/IMG_2554.jpg?ex=6a54470e&is=6a52f58e&hm=9121ad7788aeb1a978fa3f18682c24da012427d648b8614a89320b1c2ad314e2&";
  const STORAGE_KEY = 'spiral_ai_chat_history';

  // ---------------- Memory: load / save conversation history ----------------
  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      /* storage full or unavailable — fail silently, chat still works this turn */
    }
  }

  let history = loadHistory();

  // ---------------- Rendering ----------------
  function renderMessage(role, text) {
    if (emptyHint) emptyHint.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = `msg ${role === 'user' ? 'user' : 'ai'}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    if (role === 'ai') {
      const img = document.createElement('img');
      img.src = AVATAR_URL;
      img.alt = 'SPIRAL AI';
      avatar.appendChild(img);
    } else {
      avatar.textContent = '🧑';
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    chatWindow.appendChild(wrap);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return bubble;
  }

  function renderTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'msg ai';
    wrap.id = 'typing-indicator';

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    const img = document.createElement('img');
    img.src = AVATAR_URL;
    img.alt = 'SPIRAL AI';
    avatar.appendChild(img);

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    chatWindow.appendChild(wrap);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  // replay any existing history on page load (memory across reloads in this tab)
  history.forEach(msg => renderMessage(msg.role, msg.content));

  // ---------------- Sending ----------------
  async function sendMessage(text) {
    if (!text.trim()) return;

    renderMessage('user', text);
    history.push({ role: 'user', content: text });
    saveHistory(history);

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    renderTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });

      removeTyping();

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const reply = data.reply || "Sorry, I couldn't generate a response just now.";

      renderMessage('ai', reply);
      history.push({ role: 'assistant', content: reply });
      saveHistory(history);
    } catch (err) {
      removeTyping();
      renderMessage('ai', "Something went wrong reaching SPIRAL AI. Please try again in a moment.");
      console.error('SPIRAL AI error:', err);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener('click', () => sendMessage(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  });

  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => sendMessage(chip.dataset.q));
  });

  clearBtn.addEventListener('click', () => {
    history = [];
    saveHistory(history);
    chatWindow.innerHTML = '';
    chatWindow.appendChild(emptyHint);
    emptyHint.style.display = 'block';
  });
});
