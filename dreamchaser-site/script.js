(function(){
  var $=function(s,c){return (c||document).querySelector(s)}, $$=function(s,c){return [].slice.call((c||document).querySelectorAll(s))};

  // loader
  var ld=$('#loader');
  function hideLoader(){if(ld)ld.classList.add('done')}
  window.addEventListener('load',function(){setTimeout(hideLoader,350)});
  setTimeout(hideLoader,2200);

  // reveal on scroll
  var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -40px 0px'}):null;
  $$('.reveal').forEach(function(el){io?io.observe(el):el.classList.add('in')});

  // nav state, floating CTA
  var nav=$('#nav'),fb=$('.float-book'),onBook=!!$('#book');
  function onScroll(){var y=window.scrollY;if(nav)nav.classList.toggle('stuck',y>40);if(fb)fb.classList.toggle('show',y>700&&!onBook)}
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  // mobile menu
  var burger=$('#burger'),links=$('#links');
  if(burger&&links){
    var toggle=function(o){links.classList.toggle('open',o);burger.setAttribute('aria-expanded',o)};
    burger.addEventListener('click',function(){toggle(!links.classList.contains('open'))});
    $$('a',links).forEach(function(a){a.addEventListener('click',function(){toggle(false)})});
  }

  // portfolio filter + lightbox
  $$('.filters button').forEach(function(b){b.addEventListener('click',function(){
    $$('.filters button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');
    var f=b.dataset.f;$$('#masonry figure').forEach(function(fig){fig.classList.toggle('hide',f!=='all'&&fig.dataset.c!==f)});
  })});
  var lb=$('#lb');
  if(lb){
    var lbi=$('img',lb),lbp=$('p',lb);
    $$('#masonry figure').forEach(function(fig){fig.addEventListener('click',function(){
      var img=$('img',fig);if(!img||!img.complete||!img.naturalWidth)return;
      lbi.src=img.src;lbi.alt=img.alt;lbp.textContent=img.alt;lb.classList.add('open');lb.setAttribute('aria-hidden','false')})});
    var closeLb=function(){lb.classList.remove('open');lb.setAttribute('aria-hidden','true')};
    lb.addEventListener('click',closeLb);document.addEventListener('keydown',function(e){if(e.key==='Escape')closeLb()});
  }

  // christmas countdown (to 1 Dec of the upcoming Christmas season)
  var cd=$('#count');
  if(cd){
    var now=new Date(),target=new Date(now.getFullYear(),11,1);if(now>target)target=new Date(now.getFullYear()+1,11,1);
    var tick=function(){var d=Math.max(0,target-new Date()),dd=Math.floor(d/864e5),h=Math.floor(d/36e5)%24,m=Math.floor(d/6e4)%60,s=Math.floor(d/1e3)%60;
      cd.innerHTML=[['Days',dd],['Hrs',h],['Min',m],['Sec',s]].map(function(p){return '<div><b>'+String(p[1]).padStart(2,'0')+'</b><small>'+p[0]+'</small></div>'}).join('')};
    tick();setInterval(tick,1000);
  }

  // FAQ "more questions" (mobile)
  var mq=$('#moreq');if(mq){mq.addEventListener('click',function(){$('#acc').classList.add('all');mq.remove()})}

  // booking form
  var form=$('#form');
  if(form){
    // preselect session from ?session=Newborn
    try{var q=new URLSearchParams(location.search).get('session'),sel=$('#session');
      if(q&&sel)[].some.call(sel.options,function(o,i){if(o.text===q){sel.selectedIndex=i;return true}})}catch(e){}

    // To receive leads without an email app: create a free form at formspree.io and paste its URL here.
    var FORM_ENDPOINT='';
    form.addEventListener('submit',function(e){
      e.preventDefault();var f=e.target,ok=true,fine=$('#fine'),btn=$('button',f);
      ['name','phone'].forEach(function(n){var i=f.elements[n];var bad=!i.value.trim();i.classList.toggle('err',bad);if(bad)ok=false});
      if(!ok){fine.textContent='Please add your name and mobile number.';return}
      var d=new FormData(f);
      var text='Hi Dream Chaser Studio! I\'d like to book.\nName: '+d.get('name')+'\nMobile: '+d.get('phone')+'\nSession: '+d.get('session')+(d.get('date')?'\nPreferred date: '+d.get('date'):'')+(d.get('msg')?'\n'+d.get('msg'):'');
      if(FORM_ENDPOINT){
        btn.disabled=true;btn.textContent='Sending…';
        fetch(FORM_ENDPOINT,{method:'POST',body:d,headers:{Accept:'application/json'}}).then(function(r){
          if(!r.ok)throw 0;f.reset();btn.textContent='Sent ✓';fine.innerHTML='Thank you! We\'ll reply within 24 hours. Need us sooner? <a href="https://m.me/DreamchaserbyLS" target="_blank" rel="noopener">Message us</a>.';
        }).catch(function(){btn.disabled=false;btn.textContent='Send enquiry';fine.textContent='Something went wrong — please message us on Messenger or Viber.'});
      }else{
        location.href='mailto:hello@dreamchaserstudio.info?subject='+encodeURIComponent('Session enquiry — '+d.get('session'))+'&body='+encodeURIComponent(text);
        fine.innerHTML='Your email app should open. Prefer chat? <a href="viber://chat?number=%2B639175544602">Viber</a> · <a href="https://wa.me/639175544602?text='+encodeURIComponent(text)+'" target="_blank" rel="noopener">WhatsApp</a>.';
      }
    });
  }

  var yr=$('#yr');if(yr)yr.textContent=new Date().getFullYear();
})();
