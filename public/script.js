// Mover estas funciones ANTES del DOMContentLoaded
function enableSubmitButton() {
    document.getElementById('submit-btn').disabled = false;
}

function resetRecaptcha() {
    grecaptcha.reset();
    document.getElementById('submit-btn').disabled = true;
}

document.addEventListener("DOMContentLoaded", function() {
    // Obtener todos los botones de "Ver Más"
    const serviceButtons = document.querySelectorAll(".service-link");
    const closeModalButtons = document.querySelectorAll(".close-detail");
    const serviceDetails = document.querySelectorAll(".service-detail");

    // Mobile menu toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    menuToggle.addEventListener('click', function() {
        navLinks.classList.toggle('active');
        // Animate hamburger menu
        this.classList.toggle('active');
    });

    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', function() {
            navLinks.classList.remove('active');
            menuToggle.classList.remove('active');
        });
    });
        
    // Animación suave al hacer clic en los enlaces del menú
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                window.scrollTo({
                    top: targetSection.offsetTop - 70,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Abrir el modal cuando se hace clic en un servicio
    serviceButtons.forEach(button => {
        button.addEventListener("click", function(e) {
            e.preventDefault();
            const serviceId = this.getAttribute("data-service");
            const modal = document.getElementById(serviceId + "-detail");
            if (modal) {
                modal.classList.add("active");
                document.body.style.overflow = "hidden";
            }
        });
    });

    // Cerrar el modal cuando se hace clic en la "X"
    closeModalButtons.forEach(button => {
        button.addEventListener("click", function() {
            this.closest(".service-detail").classList.remove("active");
            document.body.style.overflow = "auto";
        });
    });

    // Cerrar el modal si el usuario hace clic fuera del contenido
    serviceDetails.forEach(modal => {
        modal.addEventListener("click", function(e) {
            if (e.target === this) {
                this.classList.remove("active");
                document.body.style.overflow = "auto";
            }
        });
    });

    // Aplicar animaciones a los elementos al hacer scroll
    const animatedElements = document.querySelectorAll(".section-title, .service-card, .about-content, .contact-container");

    function animateOnScroll() {
        const scrollY = window.scrollY;
        animatedElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight * 0.85) {
                el.style.opacity = 1;
                el.style.transform = "translateY(0)";
                el.style.transition = "all 0.6s ease-out";
            }
        });
    }

    window.addEventListener("scroll", animateOnScroll);
    animateOnScroll();

    // Animación de escritura
    const subtitle = document.querySelector('.typing-subtitle');
    const text = 'Soluciones tecnológicas innovadoras';
    let index = 0;

    function typeWriter() {
        if (index < text.length) {
            subtitle.textContent = text.slice(0, index + 1);
            index++;
            setTimeout(typeWriter, 100);
        }
    }

    setTimeout(() => {
        subtitle.textContent = '';
        typeWriter();
    }, 1000);

    // FORMULARIO CORREGIDO - Manejar el envío del formulario
    document.getElementById('contact-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submit-btn');
        const btnText = document.getElementById('btn-text');
        const btnIcon = document.getElementById('btn-icon');
        const messagesDiv = document.getElementById('form-messages');
        
        // Cambiar estado del botón a cargando
        submitBtn.disabled = true;
        btnText.textContent = 'Enviando...';
        btnIcon.className = 'loading-spinner';
        
        // Limpiar mensajes anteriores
        messagesDiv.innerHTML = '';
        
        // CORRECCIÓN: Obtener el token de reCAPTCHA
        const recaptchaResponse = grecaptcha.getResponse();
        
        if (!recaptchaResponse) {
            messagesDiv.innerHTML = '<div class="error-message">Por favor completa el reCAPTCHA.</div>';
            // Restaurar estado del botón
            submitBtn.disabled = false;
            btnText.textContent = 'Enviar Mensaje';
            btnIcon.className = 'fas fa-paper-plane';
            return;
        }
        
        // Recopilar datos del formulario
        const formData = new FormData(this);
        const data = Object.fromEntries(formData);
        
        // CORRECCIÓN: Agregar el token de reCAPTCHA a los datos
        data.recaptchaToken = recaptchaResponse;
        
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            const responseData = await response.json();
            
            if (response.ok) {
                messagesDiv.innerHTML = '<div class="success-message">¡Mensaje enviado correctamente! Te contactaremos pronto.</div>';
                document.getElementById('contact-form').reset();
                // Reset reCAPTCHA después del envío exitoso
                grecaptcha.reset();
                submitBtn.disabled = true; // Deshabilitar hasta que se complete reCAPTCHA nuevamente
            } else {
                // Mostrar el mensaje de error del servidor
                messagesDiv.innerHTML = `<div class="error-message">${responseData.message || 'Error al enviar el mensaje'}</div>`;
                // Reset reCAPTCHA en caso de error
                grecaptcha.reset();
                submitBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error:', error);
            messagesDiv.innerHTML = '<div class="error-message">Hubo un error al enviar el mensaje. Por favor intenta de nuevo.</div>';
            // Reset reCAPTCHA en caso de error
            grecaptcha.reset();
            submitBtn.disabled = true;
        } finally {
            // Restaurar estado del botón (excepto disabled que se maneja con reCAPTCHA)
            btnText.textContent = 'Enviar Mensaje';
            btnIcon.className = 'fas fa-paper-plane';
        }
    });
});