var PRICES = {
  uah: {
    report:  { amount: 99,   period: '₴ · разова оплата',     savings: '' },
    monthly: { amount: 249,  period: '₴ / місяць',            savings: '' },
    yearly:  { amount: 1990, period: '₴ / рік · економія 33%',savings: 'Економія ~600 ₴ порівняно з місячним' }
  },
  usd: {
    report:  { amount: 2.49,  period: '$ · one-time',         savings: '' },
    monthly: { amount: 5.99,  period: '$ / month',            savings: '' },
    yearly:  { amount: 49.99, period: '$ / year · save 30%',  savings: 'Save ~$22 vs monthly' }
  }
};
var currentCurrency = 'uah';

function setCurrency(cur, btn) {
  currentCurrency = cur;
  document.querySelectorAll('.curr-btn').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  var p = PRICES[cur];
  ['report','monthly','yearly'].forEach(function(plan) {
    var d = p[plan];
    var priceEl = document.getElementById('price-'+plan);
    var periodEl = document.getElementById('period-'+plan);
    var savEl = document.getElementById('savings-'+plan);
    if(priceEl) priceEl.textContent = cur === 'uah' ? String(d.amount) : String(d.amount);
    if(periodEl) periodEl.textContent = d.period;
    if(savEl){ savEl.textContent = d.savings; savEl.classList.toggle('show', !!d.savings); }
  });
}

function startPayment(plan, btn) {
  var origText = btn.textContent;
  btn.textContent = 'Завантаження...';
  btn.disabled = true;
  var email = '';
  try { email = prompt('Введи email для підтвердження оплати (необов\'язково):') || ''; } catch(e){}
  fetch('/api/liqpay/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: plan, currency: currentCurrency, email: email })
  })
  .then(function(res){ return res.json(); })
  .then(function(result){
    if(!result.action || !result.formData) throw new Error('no data');
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = result.action;
    Object.keys(result.formData).forEach(function(key){
      var val = result.formData[key];
      if(Array.isArray(val)){
        val.forEach(function(v){
          var inp = document.createElement('input');
          inp.type='hidden'; inp.name=key; inp.value=v;
          form.appendChild(inp);
        });
      } else {
        var inp = document.createElement('input');
        inp.type='hidden'; inp.name=key; inp.value=String(val);
        form.appendChild(inp);
      }
    });
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  })
  .catch(function(e){
    console.error('Payment error:', e);
    alert('Помилка. Спробуй ще раз або напиши на support@koleso.live');
  })
  .finally(function(){
    btn.textContent = origText;
    btn.disabled = false;
  });
}

function toggleFaq(el){ el.classList.toggle('open'); }
