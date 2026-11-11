'use strict';
const form = $('#regForm');
const msg = $('#formMsg');
const bkashPanel = $('#bkashPanel');
const cashPanel = $('#cashPanel');
let cfg = { bkashNumber: '', cashReceiver: 'Tanvir Hridoy', bkashName: '' };

api('/api/config').then((c) => {
  cfg = c;
  $('#bkashNum').textContent = c.bkashNumber;
  $('#bkashName').textContent = c.bkashName ? 'Account name: ' + c.bkashName + ' · Send Money, then submit this form.' : '';
  document.querySelectorAll('[data-cash-receiver]').forEach((e) => (e.textContent = c.cashReceiver));
}).catch(() => showMsg(msg, 'Could not load payment details. Please refresh.'));

form.addEventListener('change', (e) => {
  if (e.target.name === 'method') {
    bkashPanel.hidden = e.target.value !== 'bkash';
    cashPanel.hidden = e.target.value !== 'cash';
  }
});

$('#copyBtn').addEventListener('click', (e) => copyText(cfg.bkashNumber, e.currentTarget));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg(msg, '');
  const method = (form.elements.method.value || '');
  const payload = {
    name: form.elements.name.value,
    panjabiSize: form.elements.size.value,
    phone: form.elements.phone.value,
    method,
    senderNumber: method === 'bkash' ? form.elements.sender.value : '',
    cashConfirmed: method === 'cash' ? $('#cashConfirm').checked : false,
  };
  const btn = $('#submitBtn');
  btn.disabled = true; btn.textContent = 'Submitting…'; // blocks double-submits
  try {
    const { friend } = await api('/api/register', 'POST', payload);
    $('#formView').hidden = true;
    $('#doneView').hidden = false;
    $('#doneId').textContent = friend.id;
    const dl = $('#doneDetails');
    dl.innerHTML = '';
    [['Name', friend.name], ['Panjabi Size', friend.panjabiSize], ['Payment Method', methodLabel(friend.paymentMethod)]].forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    });
    const dt = document.createElement('dt'); dt.textContent = 'Payment Status';
    const dd = document.createElement('dd'); dd.appendChild(badge(friend.paymentStatus));
    dl.append(dt, dd);
    $('#doneNote').textContent = friend.paymentMethod === 'bkash'
      ? 'Your status changes to “Payment Completed” once the admin confirms your bKash payment.'
      : 'Your status changes to “Payment Completed” once ' + cfg.cashReceiver + ' confirms your cash payment.';
    $('#doneStatusLink').href = '/status?q=' + encodeURIComponent(friend.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showMsg(msg, err.message);
    btn.disabled = false; btn.textContent = 'Submit';
    msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
