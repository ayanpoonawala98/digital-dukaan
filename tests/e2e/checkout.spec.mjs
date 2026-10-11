import {test,expect} from '@playwright/test';
for(const width of [390,1280])test(`restaurant ${width}px: variants/addons/notes, cart, required fields, invalid coupon (no submit)`,async({page},info)=>{
 await page.setViewportSize({width,height:844});await page.goto('/store/qa-restaurant-20261008');
 await expect(page.locator('main article')).toHaveCount(1);
 await page.locator('main select').selectOption('en');
 await page.getByRole('button',{name:'Add QA Meal - do not order',exact:true}).click();
 const sheet=page.getByRole('dialog');await expect(sheet).toBeVisible();
 await sheet.getByRole('radio',{name:'Full ₹220',exact:true}).check();
 await sheet.getByRole('radio',{name:'Extra cheese + ₹30',exact:true}).check();
 await sheet.getByRole('textbox',{name:'Note for the kitchen (optional)',exact:true}).fill('QA test - no onion');
 await sheet.getByRole('button',{name:'Add to order · ₹250',exact:true}).click();
 await page.getByRole('button',{name:'Open cart',exact:true}).click();
 const drawer=page.getByRole('complementary',{name:'Place restaurant order',exact:true});
 await expect(drawer).toContainText('(Full) + Extra cheese');
 await expect(drawer.getByRole('textbox',{name:'Note for QA Meal - do not order',exact:true})).toHaveValue('QA test - no onion');
 const form=drawer.locator('form');
 await expect(form).toContainText('₹250');
 await form.getByRole('combobox',{name:'Order type',exact:true}).selectOption('takeaway');
 await expect(form.getByRole('textbox',{name:'Your name',exact:true})).toBeVisible();
 await expect(form.getByRole('textbox',{name:'Phone number',exact:true})).toBeVisible();
 await expect(form.getByRole('checkbox',{name:'Email me updates for this order if the store offers email alerts. Not marketing consent.',exact:true})).toBeDisabled();
 await form.getByRole('combobox',{name:'Order type',exact:true}).selectOption('delivery');
 await expect(form.locator('textarea')).toBeVisible();
 await form.getByRole('textbox',{name:'Coupon code (optional)',exact:true}).fill('INVALIDQA');
 await expect(drawer).toContainText(/Invalid|not found|expired|not active/i);
 const path=info.outputPath(`checkout-${width}.png`);await page.screenshot({path,fullPage:true,animations:'disabled'});await info.attach('checkout',{path,contentType:'image/png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 // Never click Place order in this live smoke. No server order or external alert is created.
});
