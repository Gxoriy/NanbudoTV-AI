/* Real backend-published model choices and workflow billing estimates. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ModelPresentation=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this,() => {
  const tiers = ["economy", "standard", "premium"];
  const suffix = tier => tier[0].toUpperCase() + tier.slice(1);
  const generic = /^(经济|标准|均衡|旗舰)(档|图片|视频)?$/;
  const canonical = value => ["wan3.0","wan-3.0","wan3.0-video","wan-3.0-video"].includes(String(value).toLowerCase()) ? "wan3.0" : String(value).toLowerCase();
  const legacyRoutes = [['official','官方线路'],['discount','特价线路']];
  const routeKinds234 = new Set(legacyRoutes.map(([id])=>id));
  const selectableModel = (row, media) => row?.media === media && row.enabled !== false &&
    row.gatewayReady !== false && !row.supportsPreciseEdit;
  const permittedModel = (profile, media, model) => !profile.visualCatalogPublished ||
    (profile.visualModels || []).some(row => selectableModel(row, media) && row.model === model);
  const discountModels234 = new Set(['seedance-2-0-special','seedance-2-0-manju-special','seedance-2-0-ecom-special','seedance-2-0-9tu-special','seedance-2-5-special','seedance-2-0-promo','seedance-2-5-promo']);
  function legacyRouteForModel(profile = {}, media, model, fallback = 'official') {
    const row=(profile.visualModels || profile.models || []).find(item=>item?.media===media && canonical(item.model || item.id)===canonical(model));
    if(routeKinds234.has(row?.routeType))return row.routeType;
    const capability=profile.modelCapabilities?.[String(model || '').toLowerCase()];
    if(routeKinds234.has(capability?.routeType))return capability.routeType;
    if(discountModels234.has(String(model || '').toLowerCase()))return 'discount';
    // An existing legacy catalog row belongs to the compatibility official
    // group. A sibling/project route cannot reclassify its concrete model ID.
    if(row || capability)return 'official';
    return routeKinds234.has(fallback)?fallback:'official';
  }
  function routeEntries(profile = {}, media) {
    if (media !== 'video' || !Array.isArray(profile.videoRouteGroups)) return legacyRoutes;
    const groups = new Map();
    for (const row of profile.videoRouteGroups) {
      if (typeof row?.id === 'string' && row.id !== 'all' && /^[a-z][a-z0-9_-]{0,31}$/.test(row.id)
          && typeof row.label === 'string' && row.label.trim() && !groups.has(row.id)) {
        groups.set(row.id, row.label.trim());
      }
    }
    for (const [id,label] of legacyRoutes) if (!groups.has(id)) groups.set(id,label);
    return [...groups];
  }
  function routeForModel(profile = {}, media, model, fallback = 'official') {
    if (media === 'video' && Array.isArray(profile.videoRouteGroups)) {
      const row = (profile.visualModels || profile.models || []).find(item=>item?.media === media &&
        canonical(item.model || item.id) === canonical(model));
      const capability = profile.modelCapabilities?.[String(model || '').toLowerCase()];
      const group = row?.routeGroup ?? capability?.routeGroup;
      const known = routeEntries(profile,media).some(([id])=>id === group);
      if (known) return group;
      if (!row && !capability && routeEntries(profile,media).some(([id])=>id === fallback)) return fallback;
    }
    return legacyRouteForModel(profile,media,model,fallback);
  }
  function routeModels(profile = {}, media, routeType, settings = {}) {
    const route = routeEntries(profile,media).some(([id])=>id===routeType)?routeType:'official';
    return catalog(profile,media,settings).filter(item=>item.routeType===route);
  }
  function availableRoutes(profile, media, settings = {}) {
    const choices = new Set(catalog(profile, media, settings).map(item => item.routeType));
    return routeEntries(profile,media).filter(([id]) => choices.has(id));
  }
  const ACTIVITY_VIDEO_WARNING = "当前为特价线路；具体时长、参考图和计费以所选模型为准。";
  const videoPrices = profile => profile.videoPricing ?? profile.visualVideoPricing ?? [];
  const videoSkuRows172 = profile => profile.videoSkuPricing172 ?? profile.visualVideoSkuPricing172 ?? [];
  function normalizeRatio172(value) {
    const parts=String(value||'').trim().replace('：',':').split(':');
    if(parts.length!==2||parts.some(v=>!/^\d+$/.test(v)||Number(v)<=0))return null;
    let [a,b]=parts.map(Number),x=a,y=b;while(y){const r=x%y;x=y;y=r;}
    const result=`${a/x}:${b/x}`;return result==='7:3'?'21:9':result;
  }
  function videoSkuPrice172(profile,model,resolution,duration,ratio) {
    const rows=videoSkuRows172(profile),related=Array.isArray(rows)?rows.filter(row=>row&&canonical(row.model)===canonical(model)&&String(row.resolution).toLowerCase()===String(resolution).toLowerCase()):[];
    if(!related.length)return undefined; // This model/resolution remains on the compatibility table.
    const normalized=normalizeRatio172(ratio),matches=related.filter(row=>Number.isInteger(row.duration)&&row.duration===Number(duration)&&normalizeRatio172(row.ratio)===normalized);
    if(!normalized||!Number.isInteger(Number(duration))||matches.length!==1)return null;
    const raw=matches[0].pricePerGeneration;
    if(typeof raw!=='number'||!Number.isFinite(raw)||raw<=0||raw>100000)return null;
    const points=publishedPriceEstimate({billingMode:'flat',rawPrice:raw,unitFactor:1});
    return points>0?{model:String(model).trim(),resolution:String(resolution).toLowerCase(),duration:Number(duration),ratio:normalized,pricePerGeneration:points,pricingProfile172:'sku',priceBasis172:'sku',estimatedPoints:points}:null;
  }
  function videoPriceRange172(profile,model,resolution='') {
    const rows=videoSkuRows172(profile),values=(Array.isArray(rows)?rows:[]).filter(row=>row&&canonical(row.model)===canonical(model)&&(!resolution||String(row.resolution).toLowerCase()===String(resolution).toLowerCase()))
      .filter(row=>typeof row.pricePerGeneration==='number'&&Number.isFinite(row.pricePerGeneration)&&row.pricePerGeneration>0&&row.pricePerGeneration<=100000)
      .map(row=>publishedPriceEstimate({billingMode:'flat',rawPrice:row.pricePerGeneration,unitFactor:1})).filter(value=>Number.isFinite(value)&&value>0);
    return values.length?{minimum:Math.min(...values),maximum:Math.max(...values),text:`按规格 ${Math.min(...values)}${Math.max(...values)!==Math.min(...values)?'–'+Math.max(...values):''} 积分/条`}:null;
  }
  function videoAbility(profile, model) {
    const key = String(model || '').toLowerCase();
    return profile.modelCapabilities?.[key] ||
      (profile.visualModels || []).find(row => row?.media === 'video' && canonical(row.model) === canonical(model)) || {};
  }
  function videoAspectRatios(profile = {}, model) {
    const declared = videoAbility(profile, model).supportedAspectRatios;
    // The public profile normalizes an undeclared capability to []. Empty is
    // not an explicit prohibition: preserve the legacy horizontal/vertical
    // defaults, but never infer widescreen support from an absent capability.
    if (declared == null || Array.isArray(declared) && declared.length === 0)
      return ['9:16', '16:9', '1:1'];
    if (!Array.isArray(declared)) return [];
    const accepted = new Set(['9:16', '16:9', '1:1', '21:9']);
    return [...new Set(declared.filter(value => typeof value === 'string' && accepted.has(value)))];
  }
  function videoDurationInfo(profile = {}, model) {
    const ability = videoAbility(profile, model);
    const integer = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
    const minimum = integer(ability.minDurationSeconds, 1);
    const maximum = Math.max(minimum, integer(ability.maxDurationSeconds, 30));
    const declared = Array.isArray(ability.supportedDurations) ? ability.supportedDurations : [];
    const exact = [...new Set(declared
      .map(Number).filter(value => Number.isInteger(value) && value >= minimum && value <= maximum))].sort((a,b) => a-b);
    const fixed = exact.length === 1 ? exact[0] : minimum === maximum ? minimum : null;
    // A range means every supported integer second, not only 5-second presets.
    // Bound the rendered list without rewriting the published min/max/fixed
    // metadata, and do not turn a malformed explicit list into a free range.
    const count = Math.max(0, Math.min(maximum - minimum + 1, 1800));
    const durations = declared.length ? exact : Array.from({length:count}, (_, index) => minimum + index);
    return {minimum, maximum, durations, fixed};
  }
  function videoDurationIssue(profile = {}, model, duration) {
    const seconds = Number(duration), info = videoDurationInfo(profile, model);
    const ability = videoAbility(profile, model);
    if (!Number.isInteger(seconds) || seconds < info.minimum || seconds > info.maximum)
      return info.fixed ? `该模型固定生成${info.fixed}秒；当前设定${duration}秒不匹配，请明确调整时长或更换模型。` : `该模型仅支持${info.minimum}至${info.maximum}秒视频。`;
    if (Array.isArray(ability.supportedDurations) && ability.supportedDurations.length && !ability.supportedDurations.map(Number).includes(seconds))
      return info.fixed ? `该模型固定生成${info.fixed}秒；当前设定${duration}秒不匹配，请明确调整时长或更换模型。` : `该模型仅支持${info.durations.join('、')}秒视频。`;
    return '';
  }
  function activityWarning(profile = {}, model, resolution = '') {
    return legacyRouteForModel(profile,'video',model) === 'discount' ? ACTIVITY_VIDEO_WARNING : '';
  }
  function videoOptionLabel(profile = {}, item = {}) {
    const model = item.id || item.model || '', name = item.name || item.displayName || model;
    const fixed = videoDurationInfo(profile, model).fixed;
    return name + (activityWarning(profile, model) ? ' · 特价线路' : '') + (fixed ? ` · 固定${fixed}秒` : '');
  }
  function imageCapability(profile = {}, model) {
    const key = String(model || '').toLowerCase();
    const published = (profile.visualModels || []).find(item => item?.media === 'image' &&
      String(item.model || '').toLowerCase() === key) || {};
    return {...published, ...(profile.modelCapabilities?.[key] || {})};
  }
  function imageResolutionOptions(profile = {}, model) {
    const capability = imageCapability(profile, model);
    const declared = Array.isArray(capability.supportedResolutions)
      ? [...new Set(capability.supportedResolutions.map(value => String(value).trim().toLowerCase()).filter(Boolean))] : [];
    if (capability.resolutionIsProviderDefault === true || declared.length === 1 && declared[0] === 'default') return ['default'];
    if (declared.length) return declared;
    const rows = profile.imagePricing ?? profile.visualImagePricing ?? [];
    const priced = Array.isArray(rows) ? [...new Set(rows.filter(row => canonical(row?.model) === canonical(model))
      .map(row => String(row.resolution || '').trim().toLowerCase()).filter(Boolean))] : [];
    if (priced.length) return priced;
    return ['1k', '2k'];
  }
  function imageResolutionForModel(profile = {}, model, resolution) {
    const requested = String(resolution || '').trim().toLowerCase();
    const capability = imageCapability(profile, model);
    const supported = Array.isArray(capability.supportedResolutions)
      ? capability.supportedResolutions.map(value => String(value).trim().toLowerCase()).filter(Boolean) : [];
    const rows = profile.imagePricing ?? profile.visualImagePricing ?? [];
    const modelPrices = Array.isArray(rows) ? rows.filter(row => canonical(row?.model) === canonical(model)) : [];
    const defaultOnlyPrice = modelPrices.length > 0 && modelPrices.every(row => String(row.resolution || '').toLowerCase() === 'default');
    if (capability.resolutionIsProviderDefault === true || supported.length === 1 && supported[0] === 'default' || defaultOnlyPrice) return 'default';
    return requested;
  }
  function imageResolutionLabel(value) {
    const resolution = String(value || '').toLowerCase();
    if (resolution === 'default') return '模型默认清晰度';
    if (resolution === '1k') return '1K · 快速预览';
    if (resolution === '2k') return '2K · 正式成图';
    return resolution.toUpperCase();
  }
  function catalog(profile, media, settings = {}) {
    const items = [];
    const published = Array.isArray(profile.visualModels) ? profile.visualModels.filter(item => selectableModel(item, media)) : [];
    for (const [index, item] of published.entries()) {
      const id = String(item.model || "").trim();
      if (!id || items.some(current => current.id === id)) continue;
      items.push({id, name:String(item.displayName || id), tier:tiers[Math.min(index, tiers.length - 1)], routeType:routeForModel(profile,media,id),pricingMode:item.pricingMode || ''});
    }
    // Once the operations server publishes a model catalog it is the single
    // source of truth. Do not mix old per-PC model IDs into the dropdown.
    if ((profile.visualCatalogPublished || profile.visualConfigRevision) && Array.isArray(profile.visualModels)) return items;
    for (const tier of tiers) {
      const key = suffix(tier), id = String(profile[`${media}Model${key}`] || "").trim();
      if (!id || items.some(item => item.id === id)) continue;
      const configured = String(profile[`${media}Name${key}`] || "").trim();
      const name = configured && !generic.test(configured) ? configured : id;
      items.push({id, name, tier, price:profile[`${media}Price${key}`],routeType:routeForModel(profile,media,id)});
    }
    const saved = settings[`${media}Model`];
    if (saved && !items.some(item => item.id === saved)) items.push({id:saved, name:saved, tier:settings[`${media}Tier`] || "economy",routeType:routeForModel(profile,media,saved,settings[`${media}RouteType`])});
    return items;
  }
  function quote(profile, model, resolution, duration, tier = "economy", ratio = null) {
    if (!permittedModel(profile, 'video', model)) return null;
    const rows = profile.videoPricing ?? profile.visualVideoPricing ?? [{model:"wan3.0",resolution:"480p",pricePerSecond:0.24},{model:"wan3.0",resolution:"720p",pricePerSecond:0.47},{model:"wan3.0",resolution:"1080p",pricePerSecond:0.94}];
    const row = rows.find(row => canonical(row.model) === canonical(model) && String(row.resolution).toLowerCase() === String(resolution).toLowerCase());
    const sku=videoSkuPrice172(profile,model,resolution,duration,ratio);
    if(sku!==undefined)return sku?{...sku,billingMode:row?.billingMode||'per_second',rate:sku.estimatedPoints,points:sku.estimatedPoints,cost:Number((sku.estimatedPoints/Number(profile.pointsPerCny||1)).toFixed(4))}:null;
    if (!row) return null;
    const factor = Number(profile.pointsPerCny || 1);
    if (String(row.billingMode || "per_second").toLowerCase() === "flat") {
      const published = publishedUnitPrice(profile,'video',model,resolution);
      const points = published ? publishedPriceEstimate(published,duration) : Number(Number(row.pricePerGeneration || 0).toFixed(2));
      return {billingMode:"flat", rate:points, cost:Number((points / factor).toFixed(4)), points};
    }
    const rate = row.pricePerSecond != null ? Number(row.pricePerSecond) * factor : Number(row.pointsPerSecond);
    const published = publishedUnitPrice(profile,'video',model,resolution);
    return {billingMode:"per_second", rate, cost:Number((rate * duration / factor).toFixed(4)), points:published ? publishedPriceEstimate(published,duration) : Number((rate * Number(duration)).toFixed(2))};
  }
  function imageQuote(profile, model, resolution, quantity = 1) {
    if (!permittedModel(profile, 'image', model)) return null;
    const rows = profile.imagePricing ?? [{model:"qwen-image-3.0",resolution:"1k",pricePerImage:.03},{model:"qwen-image-3.0",resolution:"2k",pricePerImage:.04}];
    const normalizedResolution = imageResolutionForModel(profile, model, resolution);
    const row = rows.find(row => canonical(row.model) === canonical(model) && String(row.resolution).toLowerCase() === normalizedResolution);
    if (!row) return null;
    const published = publishedUnitPrice(profile,'image',model,normalizedResolution);
    return {cost:Number((row.pricePerImage * quantity).toFixed(4)), points:published ? publishedPriceEstimate(published,quantity) : Number((row.pricePerImage * Number(profile.pointsPerCny || 1) * quantity).toFixed(2))};
  }
  // Creation previews use published tables only: no legacy sample-price fallback.
  function publishedPriceEstimate(price, quantity = 1) {
    if (!price || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return null;
    const decimal = value => {
      const parts = String(value).toLowerCase().split('e'), digits = parts[0].split('.');
      let scale = (digits[1]?.length || 0) - Number(parts[1] || 0);
      let integer = BigInt(digits.join(''));
      if (scale < 0) { integer *= 10n ** BigInt(-scale); scale = 0; }
      return {integer, scale};
    };
    const values = [price.rawPrice, price.unitFactor, ['flat','sku'].includes(price.billingMode) ? 1 : quantity].map(decimal);
    const integer = values.reduce((result,value) => result * value.integer,1n);
    const scale = values.reduce((result,value) => result + value.scale,0);
    const divisor = 10n ** BigInt(scale);
    // Match the server's Decimal ROUND_HALF_UP, including prices like 1.005.
    return Number((integer * 100n * 2n + divisor) / (2n * divisor)) / 100;
  }
  function publishedUnitPrice(profile = {}, media, model, resolution, duration = null, ratio = null) {
    if (!permittedModel(profile, media, model)) return null;
    if(media==='video'){
      const sku=videoSkuPrice172(profile,model,resolution,duration,ratio);
      if(sku!==undefined)return sku?{...sku,billingMode:'sku',rawPrice:sku.pricePerGeneration,unitFactor:1,rate:sku.pricePerGeneration,resolution:String(resolution).toUpperCase()}:null;
    }
    const rows = media === 'image' ? (profile.imagePricing ?? profile.visualImagePricing) : videoPrices(profile);
    if (!Array.isArray(rows) || !model || !resolution) return null;
    const normalizedResolution = media === 'image' ? imageResolutionForModel(profile, model, resolution) : resolution;
    const row = rows.find(item => item && canonical(item.model) === canonical(model) &&
      String(item.resolution).toLowerCase() === String(normalizedResolution).toLowerCase());
    if (!row) return null;
    const factor = Number(profile.pointsPerCny ?? 1);
    if (!Number.isSafeInteger(factor) || factor <= 0) return null;
    const mode = media === 'image' ? 'per_image' : String(row.billingMode || 'per_second').toLowerCase();
    if (!['per_image','per_second','flat'].includes(mode)) return null;
    const raw = mode === 'per_image' ? row.pricePerImage : mode === 'flat' ? row.pricePerGeneration :
      (row.pricePerSecond != null ? row.pricePerSecond : row.pointsPerSecond);
    if (!['number','string'].includes(typeof raw) || String(raw).trim() === '') return null;
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) return null;
    const unitFactor = mode === 'flat' || (mode === 'per_second' && row.pricePerSecond == null) ? 1 : factor;
    const info = {billingMode:mode, rawPrice:price, unitFactor};
    const rate = mode === 'flat' ? publishedPriceEstimate(info) : price * unitFactor;
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return {...info, rate, resolution:String(row.resolution).toUpperCase()};
  }
  function recordName(profile, media, record) {
    const id = String(record.model || "").trim();
    if (!id) return record.modelName || "未记录模型";
    const published = (profile.visualModels || []).find(item => item && item.media === media && String(item.model || "").trim().toLowerCase() === id.toLowerCase());
    if (published) return published.displayName || id;
    const mapped = profile[`${media}ModelNames`]?.[id.toLowerCase()];
    if (mapped) return mapped;
    const configured = catalog(profile, media).find(item => item.id.toLowerCase() === id.toLowerCase());
    return configured?.name || record.modelName || id;
  }
  function isLiveQuote(profile = {},media,model){
    const row=(profile.visualModels || profile.models || []).find(item=>item?.media===media&&canonical(item.model || item.id)===canonical(model));
    return row?.pricingMode==='live_quote'||profile.modelCapabilities?.[canonical(model)]?.pricingMode==='live_quote';
  }
  function pendingImageRecovery(project,url,body={}){
    if(!project||body.projectId&&body.projectId!==project.id)return null;
    const saved=url==='/api/visual/cover/generate'?project.coverGeneration:url==='/api/visual/episode/frame'?(project.episodes||[]).find(row=>row.id===body.episodeId)?.frameGeneration:null;
    return saved&&['queued','submitting','submitted','returned','pending','needs_review','unknown','not_found'].includes(saved.status)?saved:null;
  }
  function quoteFailureMessage(code,fallback){
    return /^QUOTE_/.test(String(code||''))||['PRICE_CHANGED','PRICE_QUOTE_EXPIRED','QUOTE_CONFIG_CHANGED'].includes(code)?'报价已失效或价格已变化，请重新核价并确认；本次没有自动继续生成。':fallback;
  }
  function quoteReceiptFields(receipt = {}){
    const points=Number(receipt.estimatedPoints);
    if(!Number.isFinite(points)||points<=0)throw Error('未取得有效报价，请重新核价；未提交生成。');
    if(receipt.pricingMode==='live_quote'){
      if(!receipt.priceQuoteId||!receipt.priceInputsHash)throw Error('实时报价凭据不完整，请重新核价；未提交生成。');
      const expiry=typeof receipt.expiresAt==='number'?receipt.expiresAt*(receipt.expiresAt<1e12?1000:1):Date.parse(receipt.expiresAt);
      if(!Number.isFinite(expiry)||expiry<=Date.now())throw Error('报价已过期，请重新核价并确认；未提交生成。');
      return {priceQuoteId:receipt.priceQuoteId,priceInputsHash:receipt.priceInputsHash,expectedCredits:points,expectedPoints:points,billingConfirmed:true};
    }
    const sku=receipt.pricingProfile172==='sku'?{pricingProfile172:'sku',pricingSku172:Object.fromEntries(['model','resolution','duration','ratio','pricePerGeneration'].map(key=>[key,receipt[key]]))}:{};
    return {expectedCredits:points,expectedPoints:points,...sku};
  }
  function quoteText(receipt = {}){
    const points=Number(receipt.estimatedPoints);
    if(receipt.pricingMode!=='live_quote')return (receipt.pricingProfile172==='sku'?`${String(receipt.resolution||'').toUpperCase()} · ${receipt.duration}秒 · ${receipt.ratio} · 按规格固定价 · `:'')+`本次 ${points} 积分`+(receipt.pricingFallback172?' · '+receipt.pricingFallback172:'');
    const expiry=typeof receipt.expiresAt==='number'?receipt.expiresAt*(receipt.expiresAt<1e12?1000:1):Date.parse(receipt.expiresAt);
    return `实时核价 · 本次 ${points} 积分 · 报价有效至 ${Number.isFinite(expiry)?new Date(expiry).toLocaleTimeString('zh-CN',{hour12:false}):'未确认'}`+(receipt.upstreamEstimateOnly?'\n上游估价；本次确认积分固定。':'');
  }
  return {catalog, routeForModel, legacyRouteForModel, routeEntries, routeModels, availableRoutes, quote, imageQuote, imageCapability, imageResolutionOptions, imageResolutionForModel, imageResolutionLabel, publishedUnitPrice, publishedPriceEstimate, videoSkuPrice172,videoPriceRange172,normalizeRatio172,suffix, recordName, videoAspectRatios, videoDurationInfo, videoDurationIssue, activityWarning, videoOptionLabel, ACTIVITY_VIDEO_WARNING,isLiveQuote,pendingImageRecovery,quoteFailureMessage,quoteReceiptFields,quoteText};
});
