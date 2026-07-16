/* ==========================================================================
   SPIRAL / XYZEN CLOUD — Core Script
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------------- Loader ---------------- */
  const loader = document.querySelector('.loader');
  if (loader) {
    window.addEventListener('load', () => {
      setTimeout(() => loader.classList.add('hidden'), 500);
    });
    // fallback in case load already fired
    setTimeout(() => loader.classList.add('hidden'), 2200);
  }

  /* ---------------- Navbar scroll state + active link ---------------- */
  const navbar = document.querySelector('.navbar');
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  const onScroll = () => {
    if (!navbar) return;
    if (window.scrollY > 40) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('open');
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navToggle.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });
  }

  // mark active nav link based on current page
  const currentPage = (location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  /* ---------------- Custom cursor ---------------- */
  const cursorDot = document.querySelector('.cursor-dot');
  const cursorRing = document.querySelector('.cursor-ring');
  const cursorGlow = document.querySelector('.cursor-glow');

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (cursorDot) {
        cursorDot.style.left = mouseX + 'px';
        cursorDot.style.top = mouseY + 'px';
      }
      if (cursorGlow) {
        cursorGlow.style.left = mouseX + 'px';
        cursorGlow.style.top = mouseY + 'px';
      }
    });

    function animateRing() {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      if (cursorRing) {
        cursorRing.style.left = ringX + 'px';
        cursorRing.style.top = ringY + 'px';
      }
      requestAnimationFrame(animateRing);
    }
    animateRing();

    document.querySelectorAll('a, button, .hoverable').forEach(el => {
      el.addEventListener('mouseenter', () => cursorRing && cursorRing.classList.add('active'));
      el.addEventListener('mouseleave', () => cursorRing && cursorRing.classList.remove('active'));
    });
  }

  /* ---------------- Particle background ---------------- */
  const canvas = document.getElementById('particles');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let particles = [];
    let w, h;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const count = reducedMotion ? 0 : (window.innerWidth < 700 ? 40 : 85);

    function makeParticle() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.4,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        alpha: Math.random() * 0.5 + 0.15,
        hue: Math.random() > 0.5 ? '88,101,242' : '0,212,255'
      };
    }

    for (let i = 0; i < count; i++) particles.push(makeParticle());

    function tick() {
      ctx.clearRect(0, 0, w, h);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue},${p.alpha})`;
        ctx.fill();
      });
      // connective lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(88,101,242,${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(tick);
    }
    if (!reducedMotion) tick();
  }

  /* ---------------- Typing effect ---------------- */
  const typeEl = document.querySelector('.type-line .type-text');
  if (typeEl) {
    const phrases = JSON.parse(typeEl.dataset.phrases || '[]');
    let phraseIdx = 0, charIdx = 0, deleting = false;

    function typeTick() {
      const current = phrases[phraseIdx];
      if (!deleting) {
        charIdx++;
        typeEl.textContent = current.slice(0, charIdx);
        if (charIdx === current.length) {
          deleting = true;
          setTimeout(typeTick, 1600);
          return;
        }
      } else {
        charIdx--;
        typeEl.textContent = current.slice(0, charIdx);
        if (charIdx === 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % phrases.length;
        }
      }
      setTimeout(typeTick, deleting ? 35 : 65);
    }
    if (phrases.length) typeTick();
  }

  /* ---------------- Reveal on scroll ---------------- */
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach((el, i) => {
      el.style.setProperty('--i', i % 6);
      io.observe(el);
    });
  }

  /* ---------------- Counter animation ---------------- */
  const counters = document.querySelectorAll('.num[data-count]');
  if (counters.length) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const duration = 1600;
        const start = performance.now();
        function step(now) {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const val = target * eased;
          el.textContent = (target % 1 === 0 ? Math.floor(val) : val.toFixed(1)) + suffix;
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target + suffix;
        }
        requestAnimationFrame(step);
        cio.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach(c => cio.observe(c));
  }

  /* ---------------- Skill bars ---------------- */
  const skillBars = document.querySelectorAll('.skill-bar-fill');
  if (skillBars.length) {
    const sio = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('filled');
          sio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    skillBars.forEach(b => sio.observe(b));
  }

  /* ---------------- FAQ accordion ---------------- */
  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  /* ---------------- FAQ category tabs ---------------- */
  const faqTabs = document.querySelectorAll('.faq-cat-tabs .cat-tab');
  if (faqTabs.length) {
    faqTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        faqTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const cat = tab.dataset.cat;
        document.querySelectorAll('.faq-item').forEach(item => {
          item.style.display = (cat === 'all' || item.dataset.cat === cat) ? 'block' : 'none';
        });
      });
    });
  }

  /* ---------------- Hosting category tabs ---------------- */
  const hostTabs = document.querySelectorAll('.hosting-category-tabs .cat-tab');
  if (hostTabs.length) {
    hostTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        hostTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const cat = tab.dataset.cat;
        document.querySelectorAll('.pricing-group').forEach(group => {
          group.classList.toggle('active', group.dataset.group === cat);
        });
      });
    });
  }

  /* ---------------- Billing toggle (monthly/yearly) ---------------- */
  const billToggle = document.querySelectorAll('.toggle-btn');
  if (billToggle.length) {
    billToggle.forEach(btn => {
      btn.addEventListener('click', () => {
        billToggle.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        document.querySelectorAll('.price-card').forEach(card => {
          const monthly = card.dataset.monthly;
          const yearly = card.dataset.yearly;
          const priceEl = card.querySelector('.price-amount');
          if (!priceEl) return;
          priceEl.textContent = mode === 'yearly' ? yearly : monthly;
        });
      });
    });
  }

  /* ---------------- Portfolio filter ---------------- */
  const filterBtns = document.querySelectorAll('.filter-row .filter-btn');
  if (filterBtns.length) {
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        document.querySelectorAll('.portfolio-item').forEach(item => {
          const match = filter === 'all' || item.dataset.cat === filter;
          item.classList.toggle('show', match);
        });
      });
    });
  }

  /* ---------------- Contact form (front-end only demo) ---------------- */
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const status = document.getElementById('form-status');
      const btn = contactForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Sending...';
      btn.disabled = true;
      setTimeout(() => {
        status.textContent = "Message received. I'll reply within 24 hours — or reach me faster on Discord.";
        status.classList.add('show', 'success');
        contactForm.reset();
        btn.textContent = originalText;
        btn.disabled = false;
      }, 900);
    });
  }

});
