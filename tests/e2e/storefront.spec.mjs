import {test,expect} from '@playwright/test';
const stores=[['retail','qa-test-store-20261001'],['services','qa-service-20261008'],['restaurant','qa-restaurant-20261008']];
async function ready(page){await expect(page.locator('main article').first()).toBeVisible();await expect(page.locator('main h1')).toContainText('QA');}
for(const [type,slug] of stores) for(const width of [390,1280]) {
 test(`${type} ${width}px: languages, persistence, theme, catalog and product smoke`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/store/${slug}`);
  const lang=page.locator('select').filter({has:page.locator('option[value="mr"]')});
  await ready(page);await expect(lang.last()).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Shop not found');
  for(const locale of ['en','hi','mr']) {
   await lang.last().selectOption(locale);
   await expect(lang.last()).toHaveValue(locale);
   for(const select of await lang.all()) if(await select.isVisible()) expect(await select.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(43.99);
   await page.reload();await ready(page);await expect(lang.last()).toHaveValue(locale);
   for(const theme of ['light','dark']) {
    const toggle=page.locator('.theme-toggle').first();
    await expect(toggle).toBeVisible();
    if(await page.locator('html').getAttribute('data-theme')!==theme)await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const file=info.outputPath(`${type}-${width}-${locale}-${theme}.png`);
    await page.screenshot({path:file,fullPage:true,animations:'disabled'});await info.attach(`${locale}-${theme}`,{path:file,contentType:'image/png'});
   }
  }
  const product=page.locator('main a[href*="/product/"]').first();
  if(await product.count()){
   await product.click();await expect(page).toHaveURL(/\/product\/\d+/);
   await expect(page.locator('main h1')).toContainText('QA');
   if(width===390){
    await expect(page.locator('header.header select')).toBeVisible();
    const controls=await page.locator('header.header').evaluate(h=>[...h.querySelectorAll('button,select')].filter(el=>getComputedStyle(el).display!=='none').map(el=>({label:el.getAttribute('aria-label'),x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right})));
    for(const b of controls){expect(b.x,`${b.label} left edge`).toBeGreaterThanOrEqual(0);expect(b.right,`${b.label} right edge`).toBeLessThanOrEqual(width);}
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }else test.info().annotations.push({type:'coverage',description:'No product fixture: product-detail path not exercised'});
  expect(errors,'Uncaught browser errors').toEqual([]);
 });
}
test('public routes: login/signup/near, required form validation, protected dashboard',async({page})=>{
 await page.goto('/login');await expect(page.getByRole('button',{name:'Log in'})).toBeVisible();
 await page.getByRole('button',{name:'Log in'}).click();await expect(page).toHaveURL(/\/login/);
 await page.goto('/dashboard');await expect(page).toHaveURL(/\/login/);
 await page.goto('/signup');await expect(page.locator('form')).toBeVisible();
 await page.goto('/near');await expect(page.locator('main')).toBeVisible();
});
for(const [type,slug,id] of [['services','qa-service-20261008',102],['restaurant','qa-restaurant-20261008',101]])test(`${type} mobile product header English controls stay on screen`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(`/store/${slug}/product/${id}`);
 await expect(page.locator('main h1')).toContainText('QA');
 await page.locator('header.header select').selectOption('en');
 const controls=await page.locator('header.header').evaluate(h=>[...h.querySelectorAll('button,select')].map(el=>({label:el.getAttribute('aria-label'),right:el.getBoundingClientRect().right})));
 for(const b of controls)expect(b.right,`${b.label} right edge`).toBeLessThanOrEqual(390);
});
