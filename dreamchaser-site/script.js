(function(){
  var $=function(s,c){return (c||document).querySelector(s)}, $$=function(s,c){return [].slice.call((c||document).querySelectorAll(s))};

  // loader
  window.addEventListener('load',function(){setTimeout(function(){$('#loader').classList.add('done')},500)});
  setTimeout(function(){$('#loader').classList.add('done')},2500);

  // reveal on scroll
  var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -40px 0px'}):null;
  $$('.reveal').forEach(function(el){io?io.observe(el):el.classList.add('in')});

  // nav state, floating CTA
  var nav=$('#nav'),fb=$('.float-book');
  function onScroll(){var y=window.scrollY;nav.classList.toggle('stuck',y>40);fb.classList.toggle('show',y>700&&!inView($('#book')))}
  function inView(el){var r=el.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  // mobile menu
  var burger=$('#burger'),links=$('#links');
  function toggle(o){links.classList.toggle('open',o);burger.setAttribute('aria-expanded',o)}
  burger.addEventListener('click',function(){toggle(!links.classList.contains('open'))});
  $$('a',links).forEach(function(a){a.addEventListener('click',function(){toggle(false)})});

  // portfolio: hide empty tiles whose image failed, filter, lightbox
  $$('#masonry img').forEach(function(img){img.addEventListener('error',function(){/* keeps gradient placeholder */})});
  $$('.filters button').forEach(function(b){b.addEventListener('click',function(){
    $$('.filters button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');
    var f=b.dataset.f;$$('#masonry figure').forEach(function(fig){fig.classList.toggle('hide',f!=='all'&&fig.dataset.c!==f)});
  })});
  var lb=$('#lb'),lbi=$('img',lb),lbp=$('p',lb);
  $$('#masonry figure').forEach(function(fig){fig.addEventListener('click',function(){
    var img=$('img',fig);if(!img||!img.complete||!img.naturalWidth)return;
    lbi.src=img.src;lbi.alt=img.alt;lbp.textContent=img.alt;lb.classList.add('open');lb.setAttribute('aria-hidden','false')})});
  function closeLb(){lb.classList.remove('open');lb.setAttribute('aria-hidden','true')}
  lb.addEventListener('click',closeLb);document.addEventListener('keydown',function(e){if(e.key==='Escape')closeLb()});

  // preselect session from service cards
  $$('[data-svc]').forEach(function(a){a.addEventListener('click',function(){
    var s=$('#session'),v=a.dataset.svc;[].some.call(s.options,function(o,i){if(o.text===v){s.selectedIndex=i;return true}})})});

  // christmas countdown (to 1 Dec of the upcoming Christmas season)
  var now=new Date(),target=new Date(now.getFullYear(),11,1);if(now>target)target=new Date(now.getFullYear()+1,11,1);
  var cd=$('#count');
  function tick(){var d=Math.max(0,target-new Date()),dd=Math.floor(d/864e5),h=Math.floor(d/36e5)%24,m=Math.floor(d/6e4)%60,s=Math.floor(d/1e3)%60;
    cd.innerHTML=[['Days',dd],['Hrs',h],['Min',m],['Sec',s]].map(function(p){return '<div><b>'+String(p[1]).padStart(2,'0')+'</b><small>'+p[0]+'</small></div>'}).join('')}
  tick();setInterval(tick,1000);

  // booking form -> prefilled email (no backend needed); swap for Formspree/etc. later
  $('#form').addEventListener('submit',function(e){
    e.preventDefault();var f=e.target,ok=true;
    ['name','phone'].forEach(function(n){var i=f.elements[n];var bad=!i.value.trim();i.classList.toggle('err',bad);if(bad)ok=false});
    if(!ok){$('#fine').textContent='Please add your name and mobile number.';return}
    var d=new FormData(f),body='Name: '+d.get('name')+'\nMobile: '+d.get('phone')+'\nEmail: '+d.get('email')+'\nSession: '+d.get('session')+'\nPreferred date: '+d.get('date')+'\n\n'+d.get('msg');
    location.href='mailto:hello@dreamchaserstudio.info?subject='+encodeURIComponent('Session enquiry — '+d.get('session'))+'&body='+encodeURIComponent(body);
    $('#fine').textContent='Thank you! Your email app should open — or message us on Messenger for a faster reply.';
  });

  $('#yr').textContent=new Date().getFullYear();
})();
