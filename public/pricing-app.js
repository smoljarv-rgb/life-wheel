var PRICES = {
  uah: {
    report:  { amount: 99,   period: '\u20b4 \u00b7 \u0440\u0430\u0437\u043e\u0432\u0430 \u043e\u043f\u043b\u0430\u0442\u0430',      savings: '' },
    monthly: { amount: 249,  period: '\u20b4 / \u043c\u0456\u0441\u044f\u0446\u044c',              savings: '' },
    yearly:  { amount: 1990, period: '\u20b4 / \u0440\u0456\u043a \u00b7 \u0435\u043a\u043e\u043d\u043e\u043c\u0456\u044f 33%',  savings: '\u0415\u043a\u043e\u043d\u043e\u043c\u0456\u044f ~600 \u20b4 \u043f\u043e\u0440\u0456\u0432\u043d\u044f\u043d\u043e \u0437 \u043c\u0456\u0441\u044f\u0447\u043d\u0438\u043c' }
  },
  usd: {
    report:  { amount: 2.49,  period: '$ \u00b7 one-time',           savings: '' },
    monthly: { amount: 5.99,  period: '$ / month',              savings: '' },
    yearly:  { amount: 49.99, period: '$ / year \u00b7 save 30%',    savings: 'Save ~$22 vs monthly' }
  }
};

var currentCurrency = 'uah';

function setCurrency(cur, btn) {
  currentCurrency = cur;
  document.querySelectorAll('.curr-btn').forEach(function(b) { b.classList.remove('on'); });
  if (btn) btn.classList.add('on');
  var p = PRICES[cur];
  ['report', 'monthly', 'yearly'].forEach(function(plan) {
    var d = p[plan];
    var priceEl = document.getElementById('price-' + plan);
    var periodEl = document.getElementById('period-' + plan);
    var savEl = document.getElementById('savings-' + plan);
    if (priceEl) priceEl.textContent = cur === 'uah' ? d.amount.toLocaleString('uk') : d.amount;
    if (periodEl) periodEl.textContent = d.period;
    if (savEl) { savEl.textContent = d.savings; savEl.classList.toggle('show', !!d.savings); }
  });
}

function startPayment(plan, btn) {
  var origText = btn.textContent;
  btn.textContent = '\u29d0\ufe0f \u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f...';
  btn.disabled = true;

  var email = prompt("\u0412\u0432\u0435\u0434\u0438 email \u0434\u043b\u044f \u043f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043d\u044f \u043e\u043f\u043b\u0430\u0442\u0438 (\u043d\u0435\u043e\u0431\u043e\u0432'\u044f\u0437\u043a\u043e\u0432\u043e):") || '';

  fetch('/api/liqpay/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: plan, currency: currentCurrency, email: email })
  })
  .then(function(res) { return res.json(); })
  .then(function(result) {
    if (!result.action || !result.formData) throw new Error('no data');
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = result.action;
    Object.keys(result.formData).forEach(function(key) {
      var val = result.formData[key];
      if (Array.isArray(val)) {
        val.forEach(function(v) {
          var inp = document.createElement('input');
          inp.type = 'hidden'; inp.name = key; inp.value = v;
          form.appendChild(inp);
        });
      } else {
        var inp = document.createElement('input');
        inp.type = 'hidden'; inp.name = key; inp.value = val;
        form.appendChild(inp);
      }
    });
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  })
  .catch(function(e) {
    console.error('Payment error:', e);
    alert('\u041f\u043e\u043c\u0438\u043b\u043a\u0430. \u0421\u043f\u0440\u043e\u0431\u0443\u0439 \u0449\u0435 \u0440\u0430\u0437 \u0430\u0431\u043e \u043d\u0430\u043f\u0438\u0448\u0438 \u043d\u0430 support@koleso.live');
    btn.textContent = origText;
    btn.disabled = false;
  })
  .finally(function() {
    btn.textContent = origText;
    btn.disabled = false;
  });
}
