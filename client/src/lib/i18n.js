export const dictionaries = {
  en: {
    menu:'Browse the menu', collection:'Explore the collection', all:'All products', search:'Search products...', share:'Share shop', favorites:'Favorites', order:'Place order', cart:'Order on WhatsApp', yourOrder:'Your order', type:'Order type', dine:'Dine in', takeaway:'Takeaway', delivery:'Delivery', table:'Table number', name:'Your name', phone:'Phone number', address:'Delivery address', coupon:'Coupon code', items:'Items subtotal', submit:'Place order', nothing:'Nothing is charged online.', back:'Back to menu', close:'Your order is empty.', add:'Add something from the menu.', shopClosed:'The shop is closed right now.'
  },
  hi: {
    menu:'मेन्यू देखें', collection:'सामान देखें', all:'सभी सामान', search:'सामान खोजें...', share:'दुकान शेयर करें', favorites:'पसंदीदा', order:'ऑर्डर करें', cart:'WhatsApp पर ऑर्डर करें', yourOrder:'आपका ऑर्डर', type:'ऑर्डर का प्रकार', dine:'यहीं बैठकर', takeaway:'साथ ले जाएँ', delivery:'होम डिलीवरी', table:'टेबल नंबर', name:'आपका नाम', phone:'फोन नंबर', address:'डिलीवरी का पता', coupon:'कूपन कोड', items:'सामान का कुल', submit:'ऑर्डर करें', nothing:'ऑनलाइन भुगतान नहीं लिया जाएगा।', back:'मेन्यू पर लौटें', close:'आपका ऑर्डर खाली है।', add:'मेन्यू से कुछ जोड़ें।', shopClosed:'अभी दुकान बंद है।'
  },
  mr: {
    menu:'मेनू पाहा', collection:'वस्तू पाहा', all:'सर्व वस्तू', search:'वस्तू शोधा...', share:'दुकान शेअर करा', favorites:'आवडते', order:'ऑर्डर करा', cart:'WhatsApp वर ऑर्डर करा', yourOrder:'तुमची ऑर्डर', type:'ऑर्डरचा प्रकार', dine:'इथेच बसून', takeaway:'घेऊन जा', delivery:'घरपोच', table:'टेबल क्रमांक', name:'तुमचे नाव', phone:'फोन नंबर', address:'डिलिव्हरीचा पत्ता', coupon:'कूपन कोड', items:'वस्तूंची एकूण रक्कम', submit:'ऑर्डर करा', nothing:'ऑनलाइन पेमेंट घेतले जाणार नाही.', back:'मेनूवर परत जा', close:'तुमची ऑर्डर रिकामी आहे.', add:'मेनूमधून काहीतरी जोडा.', shopClosed:'दुकान सध्या बंद आहे.'
  }
};
export const translate = (lang, key) => dictionaries[lang]?.[key] || dictionaries.en[key] || key;
