(function(){
  var K='theme',d=document.documentElement,mq=window.matchMedia('(prefers-color-scheme: light)');
  function get(){try{return localStorage.getItem(K)||'auto'}catch(e){return 'auto'}}
  function apply(m){
    if(m==='auto')d.removeAttribute('data-theme');else d.setAttribute('data-theme',m);
    var dark=m==='dark'||(m==='auto'&&!mq.matches),t=document.querySelector('meta[name=theme-color]');
    if(t)t.setAttribute('content',dark?'#14100d':'#fbf6ef');
  }
  apply(get());
  if(mq.addEventListener)mq.addEventListener('change',function(){if(get()==='auto')apply('auto')});
  window.cycleTheme=function(){var n={auto:'light',light:'dark',dark:'auto'}[get()];try{localStorage.setItem(K,n)}catch(e){}apply(n);return n};
  window.themeLabel=function(){return {auto:'🖥 Sistem',light:'☀️ Açık',dark:'🌙 Koyu'}[get()]};
})();