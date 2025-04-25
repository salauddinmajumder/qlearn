document.addEventListener('DOMContentLoaded', () => {
    // --- Simple Fade-in Effect on Scroll ---

    const sections = document.querySelectorAll('section, header, .memory-image'); // Select all elements you want to fade in

    const observerOptions = {
        root: null, // relative to the viewport
        rootMargin: '0px',
        threshold: 0.1 // Trigger when 10% of the element is visible
    };

    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // Stop observing once visible
            }
        });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    sections.forEach(section => {
        observer.observe(section);
    });

    // --- Optional: Smooth Scroll (if you add internal links) ---
    // const links = document.querySelectorAll('a[href^="#"]');
    // links.forEach(link => {
    //     link.addEventListener('click', function(e) {
    //         e.preventDefault();
    //         let targetId = this.getAttribute('href');
    //         let targetElement = document.querySelector(targetId);
    //         if(targetElement) {
    //             targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    //         }
    //     });
    // });

    console.log("Page loaded and scripts running. Ready to apologize.");
});
