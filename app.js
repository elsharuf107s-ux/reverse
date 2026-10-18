const form = document.getElementById('brief-form');
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const text = `CODEBASE CLARITY — PROJECT BRIEF\n\nAgency: ${data.get('company')}\nSource lines: ${data.get('size')}\n\nContext:\n${data.get('project')}\n\nProposed scope: one JavaScript/Node repository, up to 25,000 non-generated first-party source lines.\nDeliverables: reviewed architecture handover, dependencies, verification checklist, maintenance plan, 30-minute walkthrough, one revision.\nProposed price: $1,000 USD ($500 to start, $500 on delivery).\nTarget: three business days after agreed access and deposit; date to be confirmed.\n\nThis brief is a request for discussion, not a purchase or contract. Do not attach credentials or proprietary source before agreeing access.\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'codebase-clarity-project-brief.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.getElementById('form-status').textContent = 'Brief downloaded. No message was sent and no payment was taken.';
});
// Static hosting has no API. The public contact is also visible without JavaScript.
const contactLink = document.getElementById('contact-link');
contactLink.href = "mailto:elsharuf107s@gmail.com?subject=Codebase%20Clarity%20%E2%80%94%20project%20scope";
contactLink.hidden = false;
