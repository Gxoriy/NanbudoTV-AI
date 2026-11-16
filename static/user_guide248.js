const guideTextSize = document.getElementById('guideTextSize');
guideTextSize.addEventListener('change', () => {
  document.documentElement.style.fontSize = (16 * Number(guideTextSize.value) / 100) + 'px';
});
document.getElementById('returnGuide').addEventListener('click', event => {
  if (window.parent === window) return;
  event.preventDefault();
  window.parent.postMessage({type: 'nanbudo:return-user-guide'}, location.origin);
});

const imagePreview = document.getElementById('guideImagePreview');
if (imagePreview && typeof imagePreview.showModal === 'function') {
  const previewImage = imagePreview.querySelector('img');
  const previewCaption = imagePreview.querySelector('p');
  document.querySelectorAll('.guide-shot a').forEach(link => {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      previewImage.src = link.href;
      previewImage.alt = link.querySelector('img').alt;
      previewCaption.textContent = link.closest('figure').querySelector('figcaption').textContent;
      imagePreview.showModal();
    });
  });
  imagePreview.addEventListener('close', () => previewImage.removeAttribute('src'));
}
