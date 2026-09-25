/* ============================================================================
   قاعدة اختبار بحجم المرحلة الثالثة (3D) — تُحقن في الصفحة وتُكتب دفعةً واحدة.
   المقصود قياس القراءة والرسم على حجم حقيقي، لا قياس سرعة الكتابة.
     10,000 مشتركة · 10,000 اشتراك · 20,000 دفعة · 20,000 سطر إيراد
     10,000 فاتورة بيع · 22,000 حركة مخزون · 5,000 مستند شراء
     15,000 حضور · 3,000 حدث
   ========================================================================== */
window.TGFixture = (() => {
  async function buildLarge(){
    const { DB, D, STORE_NAMES } = window.TG;
    const now = new Date().toISOString(), today = D.today();
    let seq = 0;
    const uid = p => `${p}_${(seq++).toString(36)}_L`;
    const base = o => Object.assign({ createdAt:now, updatedAt:now, archived:false }, o);
    const F = ['زهراء','فاطمة','نور','سجى','رقية','مريم','آية','هبة','دعاء','لينا','زينب','بتول'];
    const L = ['الموسوي','الحسيني','الزبيدي','الجابري','العبادي','الساعدي','الربيعي','التميمي'];

    const members = [], subs = [], payments = [], revenues = [], attendance = [], receipts = [],
          sales = [], stock = [], products = [], audit = [], notes = [], suppliers = [],
          purchases = [], purchasePayments = [], expenses = [], partners = [], distributions = [],
          capital = [], measurements = [];

    for (let i = 0; i < 10000; i++)
      members.push(base({ id:uid('mem'), name:`${F[i % F.length]} ${L[i % L.length]}`,
        code:'ت' + String(i + 1).padStart(5, '0'), phone:'0770' + String(1000000 + i),
        joinDate:D.addDays(today, -(i % 900)), suspended:false, custom:{} }));

    for (let i = 0; i < 400; i++)
      products.push(base({ id:uid('prd'), name:`صنف ${i}`, sku:'S' + i, category:'مكمّلات', unit:'قطعة',
        price:1000 + i * 10, cost:500 + i * 5, minStock:3, active:true, stockTracked:true }));
    /* رصيد افتتاحي: 400 حركة */
    products.forEach(p => stock.push(base({ id:uid('stk'), productId:p.id, date:D.addDays(today, -500),
      type:'purchase', qty:2000, unitCost:p.cost, refType:null, refId:null, expenseId:null })));

    for (let i = 0; i < 10000; i++){
      const m = members[i % members.length];
      const start = D.addDays(today, -(i % 800));
      const price = [45000, 60000, 90000, 120000][i % 4];
      subs.push(base({ id:uid('sub'), memberId:m.id, planId:null, planName:'شهر', durationValue:1,
        durationUnit:'month', durationLabel:'شهر', startDate:start, endDate:D.addDays(start, 29),
        baseEndDate:D.addDays(start, 29), price, discount:0, finalPrice:price, paymentMethod:'cash',
        sessionCredits:0, ptCredits:0 }));
    }

    /* دفعتان لكل اشتراك = 20,000 دفعة و20,000 سطر إيراد */
    for (let i = 0; i < 20000; i++){
      const s = subs[i % subs.length], amt = Math.round(s.finalPrice / 2);
      const pid = uid('pmt'), rid = uid('rev'), meth = i % 5 === 0 ? 'transfer' : 'cash';
      payments.push(base({ id:pid, refType:'subscription', refId:s.id, memberId:s.memberId, date:s.startDate,
        amount:amt, method:meth, notes:'', revenueId:rid }));
      revenues.push(base({ id:rid, date:s.startDate, amount:amt, source:'subscription', refId:s.id,
        paymentId:pid, description:'اشتراك', method:meth, notes:'' }));
      if (i % 4 === 0) receipts.push(base({ id:uid('rcp'), no:'و' + String(i).padStart(6, '0'),
        refType:'subscription', refId:s.id, paymentId:pid, memberId:s.memberId, amount:amt, issuedAt:now,
        issuedBy:'', format:'a4', reprints:0, lastPrintedAt:null, voided:false,
        snapshot:{ member:{ name:'', code:'' }, doc:{}, payment:{} } }));
    }

    for (let i = 0; i < 15000; i++)
      attendance.push(base({ id:uid('att'), memberId:members[i % members.length].id,
        date:D.addDays(today, -(i % 300)), time:'10:00', trainingId:null, sessionId:null,
        method:'staff', status:'in', checkOut:null, notes:'' }));

    /* 10,000 فاتورة، كل واحدة حركة مخزون = 10,000 حركة */
    for (let i = 0; i < 10000; i++){
      const p = products[i % products.length], sid = uid('sal');
      sales.push(base({ id:sid, code:'ف' + String(i).padStart(6, '0'), date:D.addDays(today, -(i % 300)),
        memberId:members[i % members.length].id, customerName:'',
        lines:[{ productId:p.id, name:p.name, qty:1, unitPrice:p.price, discount:0, unitCost:p.cost, total:p.price }],
        subtotal:p.price, discount:0, total:p.price, items:1, notes:'' }));
      stock.push(base({ id:uid('stk'), productId:p.id, date:D.addDays(today, -(i % 300)), type:'sale',
        qty:-1, unitCost:p.cost, refType:'sale', refId:sid, expenseId:null }));
    }

    for (let i = 0; i < 20; i++)
      suppliers.push(base({ id:uid('sup'), name:`مورّد ${i}`, phone:'0781' + String(2000000 + i),
        notes:'', openingBalance:0 }));
    /* 5,000 مستند شراء بسطرين لكل واحد ⇒ 10,000 حركة مخزون
       المجموع: 400 + 10,000 + 10,000 + 1,600 = 22,000 حركة */
    for (let i = 0; i < 5000; i++){
      const sup = suppliers[i % suppliers.length], pid = uid('pur'), eid = uid('exp');
      const date = D.addDays(today, -(i % 600));
      const lines = [
        { productId:products[(i * 2) % products.length].id, qty:10, unitCost:600 },
        { productId:products[(i * 2 + 1) % products.length].id, qty:5, unitCost:900 },
      ];
      const subtotal = lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
      purchases.push(base({ id:pid, code:'ش' + String(i + 1).padStart(5, '0'), supplierId:sup.id, date,
        invoiceNo:'INV' + i, lines:lines.map(l => Object.assign({ total:l.qty * l.unitCost }, l)),
        subtotal, discount:0, total:subtotal,
        items:lines.reduce((a, l) => a + l.qty, 0), status:'posted', expenseId:eid,
        postedAt:now, cancelledAt:null, cancelReason:'', notes:'' }));
      expenses.push(base({ id:eid, date, amount:subtotal, categoryId:null,
        description:`شراء ش${String(i + 1).padStart(5, '0')}`, payee:sup.name, notes:'',
        method:'credit', refType:'purchase', refId:pid }));
      lines.forEach(l => stock.push(base({ id:uid('stk'), productId:l.productId, date, type:'purchase',
        qty:l.qty, unitCost:l.unitCost, refType:'purchase', refId:pid, expenseId:null })));
      purchasePayments.push(base({ id:uid('ppm'), purchaseId:pid, supplierId:sup.id, date,
        amount: i % 3 === 0 ? Math.round(subtotal / 2) : subtotal,
        method: i % 2 ? 'cash' : 'transfer', notes:'' }));
    }
    /* 1,600 حركة تسوية تُكمل 22,000 */
    for (let i = 0; i < 1600; i++){
      const p = products[i % products.length];
      stock.push(base({ id:uid('stk'), productId:p.id, date:D.addDays(today, -(i % 300)),
        type:'adjust', qty: i % 2 ? 1 : -1, unitCost:p.cost, refType:null, refId:null, expenseId:null }));
    }

    for (let i = 0; i < 2; i++)
      partners.push(base({ id:uid('prt'), name:`شريكة ${i}`, sharePercent:50, notes:'' }));
    for (let i = 0; i < 240; i++){
      const k = D.monthsBack(24)[i % 24];
      distributions.push(base({ id:uid('dst'), partnerId:partners[i % partners.length].id,
        periodFrom:D.startOfMonth(k), periodTo:D.endOfMonth(k), amount:100000, date:D.endOfMonth(k),
        method:'cash', allocations:[{ key:k, net:0, share:0, amount:100000 }],
        allocationSource:'migrated', notes:'' }));
    }
    for (let i = 0; i < 40; i++)
      capital.push(base({ id:uid('cap'), date:D.addDays(today, -(i * 17)), amount:500000,
        type: i % 4 === 3 ? 'withdrawal' : 'injection',
        kind: i % 4 === 3 ? 'capital_return' : 'capital_injection',
        method:['cash','transfer','card'][i % 3], partnerId:partners[i % partners.length].id,
        description:'حركة رأس مال', notes:'' }));
    for (let i = 0; i < 3000; i++)
      audit.push(base({ id:uid('aud'), ts:now, entity:'payment', action:'create', summary:'قبض', entityId:null }));
    for (let i = 0; i < 500; i++)
      notes.push(base({ id:uid('not'), memberId:members[i].id, text:'ملاحظة', kind:'general',
        date:today, author:'المالكة', pinned:false }));
    for (let i = 0; i < 1000; i++)
      measurements.push(base({ id:uid('mea'), memberId:members[i].id, date:D.addDays(today, -(i % 200)),
        weight:60 + (i % 30), height:165, notes:'' }));

    const closedPeriods = D.monthsBack(25).slice(0, 24).map(k => ({ key:k,
      from:D.startOfMonth(k), to:D.endOfMonth(k), revenue:0, expense:0, net:0,
      closedAt:now, closedBy:'المالكة', acknowledged:[] }));

    for (const [st, rows] of [['members',members],['products',products],['subscriptions',subs],
      ['payments',payments],['revenues',revenues],['receipts',receipts],['attendance',attendance],
      ['sales',sales],['stockMoves',stock],['audit',audit],['notes',notes],['measurements',measurements],
      ['suppliers',suppliers],['purchases',purchases],['purchasePayments',purchasePayments],
      ['expenses',expenses],['partners',partners],['distributions',distributions],['capital',capital]])
      await DB.putMany(st, rows);

    const stRec = DB.get('meta','settings') || { k:'settings', v:{} };
    await DB.put('meta', Object.assign({}, stRec, { k:'settings',
      v:Object.assign({}, stRec.v || {}, { closedPeriods, purchaseSeq:5000 }) }));

    return Object.fromEntries(STORE_NAMES.map(s => [s, DB.count(s)]).filter(([, n]) => n));
  }
  return { buildLarge };
})();
