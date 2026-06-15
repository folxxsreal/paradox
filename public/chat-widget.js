document.addEventListener('DOMContentLoaded', function() {
    const chatToggle = document.getElementById('chatbot-toggle');
    const chatWindow = document.getElementById('chatbot-window');
    const chatClose = document.getElementById('chatbot-close');
    const chatInput = document.getElementById('chatbot-input');
    const chatSend = document.getElementById('chatbot-send');
    const chatMessages = document.getElementById('chatbot-messages');

    if (!chatToggle || !chatWindow || !chatClose || !chatInput || !chatSend || !chatMessages) {
        return;
    }

    const WIDGET_VERSION = '1.2.5';
    window.__GODELIN_WIDGET_VERSION__ = WIDGET_VERSION;
    console.info(`[Godelin] widget ${WIDGET_VERSION}`);
    const HISTORY_KEY = 'godelin_session_history_v121';
    const MAX_LOCAL_TURNS = 24;
    const MAX_SENT_TURNS = 12;
    let isOpen = false;
    let conversationHistory = loadHistory();

    function loadHistory() {
        try {
            const parsed = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(item => item && (item.role === 'user' || item.role === 'assistant'))
                .map(item => ({
                    role: item.role,
                    content: String(item.content || '').slice(0, 1200)
                }))
                .filter(item => item.content.trim())
                .slice(-MAX_LOCAL_TURNS);
        } catch {
            return [];
        }
    }

    function saveHistory() {
        conversationHistory = conversationHistory.slice(-MAX_LOCAL_TURNS);
        try {
            sessionStorage.setItem(HISTORY_KEY, JSON.stringify(conversationHistory));
        } catch {
            // El chat puede continuar aunque sessionStorage no esté disponible.
        }
    }

    function renderConversation() {
        if (chatMessages.children.length > 0) return;

        addMessage(
            'bot',
            '¡Hola! Soy Godelin, tu asistente virtual de Paradox Systems. ¿En qué puedo ayudarte hoy?',
            false
        );

        for (const item of conversationHistory) {
            addMessage(item.role === 'assistant' ? 'bot' : 'user', item.content, false);
        }
    }

    chatToggle.addEventListener('click', function() {
        isOpen = !isOpen;
        chatWindow.classList.toggle('chatbot-hidden', !isOpen);
        if (isOpen) renderConversation();
    });

    chatClose.addEventListener('click', function() {
        isOpen = false;
        chatWindow.classList.add('chatbot-hidden');
    });

    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        const priorHistory = conversationHistory.slice(-MAX_SENT_TURNS);
        addMessage('user', message, true);
        chatInput.value = '';
        chatSend.disabled = true;

        const typingId = showTypingIndicator();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message,
                    history: priorHistory,
                    clientVersion: WIDGET_VERSION
                })
            });

            const data = await response.json().catch(() => ({}));
            removeTypingIndicator(typingId);

            if (!response.ok || data.error) {
                addMessage('bot', 'Lo siento, ocurrió un error. Por favor intenta de nuevo.', true);
            } else {
                addMessage('bot', data.response, true);
            }
        } catch (error) {
            removeTypingIndicator(typingId);
            addMessage('bot', 'Lo siento, no pude procesar tu mensaje. Por favor intenta de nuevo.', true);
        } finally {
            chatSend.disabled = false;
            chatInput.focus();
        }
    }

    function addMessage(sender, content, record = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (record) {
            conversationHistory.push({
                role: sender === 'bot' ? 'assistant' : 'user',
                content: String(content || '').slice(0, 1200)
            });
            saveHistory();
        }
    }

    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot';
        typingDiv.id = 'typing-indicator';

        const typingContent = document.createElement('div');
        typingContent.className = 'typing-indicator';
        typingContent.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

        typingDiv.appendChild(typingContent);
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return 'typing-indicator';
    }

    function removeTypingIndicator(id) {
        const typingElement = document.getElementById(id);
        if (typingElement) typingElement.remove();
    }
});
