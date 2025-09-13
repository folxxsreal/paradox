document.addEventListener("DOMContentLoaded", function() {
    // Obtener todos los botones de "Ver Más"
    const serviceButtons = document.querySelectorAll(".service-link");
    const closeModalButtons = document.querySelectorAll(".close-detail");
    const serviceDetails = document.querySelectorAll(".service-detail");
    // Animación suave al hacer clic en los enlaces del menú
    document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href'); // Obtiene el ID del enlace
        const targetSection = document.querySelector(targetId);
        if (targetSection) {
        window.scrollTo({
            top: targetSection.offsetTop - 70, // Ajustar para que no quede debajo del navbar
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
        document.body.style.overflow = "hidden"; // Evita el scroll cuando el modal está abierto
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
    // Ejecutar la animación cuando se haga scroll
    window.addEventListener("scroll", animateOnScroll);
    // Correr la animación al cargar la página
    animateOnScroll();
    // Animación de escritura
    const subtitle = document.querySelector('.typing-subtitle');
    const text = 'Soluciones tecnológicas innovadoras';
    let index = 0;

    function typeWriter() {
    if (index < text.length) {
        subtitle.textContent = text.slice(0, index + 1);
        index++;
        setTimeout(typeWriter, 100); // Velocidad de escritura (100ms por letra)
    }
    }
    // Iniciar la animación después de 1 segundo
    setTimeout(() => {
    subtitle.textContent = '';
    typeWriter();
    }, 1000);

        // Manejar el envío del formulario
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
    
    // Recopilar datos del formulario
    const formData = new FormData(this);
    const data = Object.fromEntries(formData);
    
    try {
        const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
        });
        
        if (response.ok) {
        messagesDiv.innerHTML = '<div class="success-message">¡Mensaje enviado correctamente! Te contactaremos pronto.</div>';
        document.getElementById('contact-form').reset();
        } else {
        throw new Error('Error en el servidor');
        }
    } catch (error) {
        messagesDiv.innerHTML = '<div class="error-message">Hubo un error al enviar el mensaje. Por favor intenta de nuevo.</div>';
    } finally {
        // Restaurar estado del botón
        submitBtn.disabled = false;
        btnText.textContent = 'Enviar Mensaje';
        btnIcon.className = 'fas fa-paper-plane';
    }
    });

    // Función callback para cuando se valida el reCAPTCHA
    function enableSubmitButton() {
        document.getElementById('submit-btn').disabled = false;
    }

    // Función para resetear el reCAPTCHA después de enviar
    function resetRecaptcha() {
        grecaptcha.reset();
        document.getElementById('submit-btn').disabled = true;
    }
});