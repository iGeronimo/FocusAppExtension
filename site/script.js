// Focus landing – minimal JS
(function(){
  const navToggle = document.getElementById('navToggle');
  const menu = document.getElementById('menu');
  if(navToggle && menu){
    navToggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Smooth scroll for in-page anchors
  const links = document.querySelectorAll('a[href^="#"]');
  for(const a of links){
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if(!id || id === '#') return;
      const target = document.querySelector(id);
      if(target){
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Close mobile menu after navigation
        if(menu && menu.classList.contains('open')){
          menu.classList.remove('open');
          navToggle?.setAttribute('aria-expanded', 'false');
        }
      }
    });
  }
})();
