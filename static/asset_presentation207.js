/* Display labels only. Asset names, IDs, aliases, media and receipts stay exact. */
(function (root, factory) {
  'use strict';
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.AssetPresentation207=api;
})(typeof globalThis!=='undefined'?globalThis:this,function () {
  'use strict';
  const value=text=>typeof text==='string'?text.trim():'';
  const nameKey=text=>value(text).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  function displayName(asset, allPeople) {
    const name=value(asset?.name);
    if(!name)return '未命名人物';
    const variant=value(asset?.variant);
    if(!variant || !Array.isArray(allPeople))return name;
    // A variant is explicit source data, never guessed from descriptions,
    // aliases, profession, clothing prose or another same-name character.
    const peers=allPeople.filter(row=>nameKey(row?.name)===nameKey(name));
    if(peers.length<2)return name;
    if(name.endsWith('（'+variant+'）')||name.endsWith('('+variant+')'))return name;
    return name+'（'+variant+'）';
  }
  return {version:207,displayName};
});
