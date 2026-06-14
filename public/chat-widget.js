document.addEventListener('DOMContentLoaded', function() {
    const chatToggle = document.getElementById('chatbot-toggle');
    const chatWindow = document.getElementById('chatbot-window');
    const chatClose = document.getElementById('chatbot-close');
    const chatInput = document.getElementById('chatbot-input');
    const chatSend = document.getElementById('chatbot-send');
    const chatMessages = document.getElementById('chatbot-messages');

    let isOpen = false;

    // Toggle chat window
    chatToggle.addEventListener('click', function() {
        isOpen = !isOpen;
        chatWindow.classList.toggle('chatbot-hidden', !isOpen);
        if (isOpen && chatMessages.children.length === 0) {
            addMessage('bot', '¡Hola! Soy Godelin, tu asistente virtual de Paradox Systems. ¿En qué puedo ayudarte hoy?');
        }
    });

    // Close chat
    chatClose.addEventListener('click', function() {
        isOpen = false;
        chatWindow.classList.add('chatbot-hidden');
    });

    // Send message
    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        addMessage('user', message);
        chatInput.value = '';

        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            removeTypingIndicator(typingId);

            if (data.error) {
                addMessage('bot', 'Lo siento, ocurrió un error. Por favor intenta de nuevo.');
            } else {
                addMessage('bot', data.response);
            }
        } catch (error) {
            removeTypingIndicator(typingId);
            addMessage('bot', 'Lo siento, no pude procesar tu mensaje. Por favor intenta de nuevo.');
        }
    }

    function addMessage(sender, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;
        
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
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
        if (typingElement) {
            typingElement.remove();
        }
    }
});
