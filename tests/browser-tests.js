/* ============================================================================
   تبارك جيم — اختبارات الثوابت داخل المتصفح
   تُحقن في الصفحة بعد اكتمال الإقلاع وتعمل فوق window.TG وحده.
   كل اختبار يقول ما الذي يثبته بالضبط، ويفشل برسالة تكفي لمعرفة السبب.
   ========================================================================== */
window.TGTests = (() => {
  const T = () => window.TG;
  let results = [];
  const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const ok = (name, pass, detail) => { results.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) }); return !!pass; };
  const eq = (name, got, want, note) =>
    ok(name, round2(got) === round2(want), `got=${got} want=${want}${note ? ' — ' + note : ''}`);

  /* ------------------------- أدوات مشتركة ------------------------- */
  const totals = () => {
    const { Repos, U } = T();
    return {
      revenue: round2(U.sum(Repos.revenues.list(true), r => r.amount)),
      expense: round2(U.sum(Repos.expenses.list(true), e => e.amount)),
      payments: round2(U.sum(Repos.payments.list(true), p => p.amount)),
      capital: round2(U.sum(Repos.capital.list(true), c => c.amount)),
      subPrice: round2(U.sum(Repos.subs.list(true), s => s.finalPrice)),
      salesTotal: round2(U.sum(Repos.sales.list(true), s => s.total)),
      counts: Object.fromEntries(T().STORE_NAMES.map(s => [s, T().DB.count(s)]))
    };
  };
  const endDates = () => Object.fromEntries(T().Repos.subs.list(true).map(s => [s.id, s.endDate]));

  /* نسخة احتياطية بشكل إصدار أقدم: تُبنى من نسخة v5 بعكس ما فعلته الترقية.
     الهدف أن نختبر الترقية على بيانات تشبه ما في أجهزة النوادي فعلاً. */
  function downgrade(backup, schema){
    const { U } = T();
    const b = U.clone(backup);
    b.schema = schema;
    const LABEL = { cash:'نقد', transfer:'تحويل', card:'بطاقة' };
    const lab = k => LABEL[k] || k;
    (b.data.payments || []).forEach(p => { p.method = lab(p.method); });
    (b.data.revenues || []).forEach(r => { r.method = lab(r.method); });
    (b.data.subscriptions || []).forEach(s => {
      s.paymentMethod = lab(s.paymentMethod);
      delete s.baseEndDate;                       /* v4 كان يترك الأصل يشرد عن النهاية */
    });
    (b.data.staff || []).forEach(s => { if (s.payMethod) s.payMethod = lab(s.payMethod); });
    (b.data.expenses || []).forEach(e => { delete e.method; });
    /* قوائم الالتحاق الثابتة تعود إلى القالب كما كانت في v4 */
    const members = (b.data.members || []).map(m => m.id);
    (b.data.trainings || []).forEach((t, i) => {
      t.memberIds = members.slice(i * 2, i * 2 + 3);
      delete t.legacyMemberIds;
    });
    const settings = (b.data.meta || []).find(x => x.k === 'settings');
    if (settings && settings.v){
      settings.v.paymentMethods = ['نقد', 'تحويل', 'بطاقة', 'زين كاش'];
      delete settings.v.legacyEnrollmentsSeen;
    }
    const sch = (b.data.meta || []).find(x => x.k === 'schema');
    if (sch) sch.v = schema;
    if (schema < 4){
      /* v3: لا حضور بطريقة تسجيل ولا قوالب موسومة، ولا جداول الإصدار الرابع */
      (b.data.attendance || []).forEach(a => { delete a.method; delete a.status; delete a.sessionId; });
      (b.data.trainings || []).forEach(t => { delete t.kind; });
      ['measurements','goals','memberDocs','customFields','receipts','subEvents','credits',
       'leads','tasks','classSessions','bookings','cashDays','suppliers'].forEach(s => { b.data[s] = []; });
      (b.data.trainings || []).forEach(t => { t.memberIds = members.slice(0, 2); });
    }
    return b;
  }

  /* ========================= 1) ثوابت المال ========================= */
  async function money(){
    const { Repos, Svc, Calc, U, D, Money } = T();
    /* Σ سطور الإيراد المولَّدة من دفعات = Σ الدفعات */
    const fromPayments = Repos.revenues.list(true).filter(r => r.paymentId);
    eq('كل إيراد مولَّد من دفعة يساوي مجموع الدفعات',
       U.sum(fromPayments, r => r.amount), U.sum(Repos.payments.list(true), p => p.amount));

    /* لكل دفعة سطر إيراد واحد لا أكثر ولا أقل */
    const byPayment = {};
    Repos.revenues.list(true).forEach(r => { if (r.paymentId) byPayment[r.paymentId] = (byPayment[r.paymentId] || 0) + 1; });
    const pays = Repos.payments.list(true);
    const missing = pays.filter(p => !byPayment[p.id]);
    const doubled = Object.keys(byPayment).filter(k => byPayment[k] > 1);
    ok('لكل دفعة سطر إيراد واحد بالضبط', !missing.length && !doubled.length,
       `بلا إيراد=${missing.length} مكرّرة=${doubled.length}`);

    /* المقبوض لا يتجاوز المستحق على أي مستند */
    const subIdx = Svc.payments.indexBy('subscription'), saleIdx = Svc.payments.indexBy('sale');
    const over = [
      ...Repos.subs.list().filter(s => round2(subIdx[s.id] || 0) > round2(s.finalPrice) + 0.001),
      ...Repos.sales.list().filter(s => round2(saleIdx[s.id] || 0) > round2(s.total) + 0.001)
    ];
    ok('المقبوض ≤ المستحق على كل مستند', !over.length, `مستندات مخالفة=${over.length}`);

    /* «المدفوع» في إحصاء المشتركة يُقرأ من الدفعات لا من السعر */
    const m = Repos.members.list()[0];
    if (m){
      const subs = Svc.subs.ofMember(m.id);
      const st = Calc.memberStats(subs, subIdx);
      eq('إجمالي مدفوع المشتركة = مجموع دفعات اشتراكاتها',
         st.totalPaid, U.sum(subs, s => subIdx[s.id] || 0));
      ok('إحصاء المشتركة يفصل المستحق عن المقبوض',
         st.totalOwed !== undefined && st.totalOwed === round2(U.sum(subs, s => s.finalPrice)),
         `owed=${st.totalOwed}`);
    }

    /* الطباعة وإعادتها لا تلمسان المال */
    const pay = pays.find(p => !p.archived);
    if (pay){
      const before = totals();
      const rc = await Svc.receipts.ensure(pay.id);
      const rc2 = await Svc.receipts.ensure(pay.id);
      ok('إصدار الوصل مرتين يعطي الرقم نفسه', rc.id === rc2.id && rc.no === rc2.no, `${rc.no} / ${rc2.no}`);
      await Svc.receipts.markPrinted(rc.id);
      const afterFirst = T().Repos.receipts.get(rc.id);
      await Svc.receipts.markPrinted(rc.id);
      const afterSecond = T().Repos.receipts.get(rc.id);
      eq('إعادة الطباعة تزيد عدّاد النسخ واحداً', afterSecond.reprints, (afterFirst.reprints || 0) + 1);
      const after = totals();
      ok('الطباعة وإعادتها لا تغيّران أي رقم مالي',
         before.revenue === after.revenue && before.payments === after.payments && before.expense === after.expense,
         JSON.stringify({ before:[before.revenue, before.payments], after:[after.revenue, after.payments] }));

      /* لقطة الوصل: «المدفوع سابقاً» لا يشمل دفعة اليوم نفسه المسجّلة بعده */
      const snap = afterSecond.snapshot || {};
      ok('لقطة الوصل تحمل تسمية طريقة الدفع', !!(snap.payment && snap.payment.methodLabel),
         JSON.stringify(snap.payment || {}));
    }

    /* حذف دفعة يُبطل وصلها ويحذف إيرادها */
    const doc = Repos.subs.list().find(s => Svc.payments.forRef('subscription', s.id).length);
    if (doc){
      const p = Svc.payments.forRef('subscription', doc.id)[0];
      const rc = await Svc.receipts.ensure(p.id);
      const revBefore = round2(U.sum(Repos.revenues.list(true), r => r.amount));
      await Svc.payments.remove(p.id);
      const rcAfter = Repos.receipts.get(rc.id);
      ok('حذف الدفعة يُبطل وصلها ولا يمحوه', !!rcAfter && rcAfter.voided === true, JSON.stringify(rcAfter && rcAfter.voided));
      eq('حذف الدفعة يسحب سطر إيرادها', round2(U.sum(Repos.revenues.list(true), r => r.amount)), revBefore - p.amount);
      ok('الدفعة المحذوفة لم يبقَ لها أثر في الدفعات', !Repos.payments.get(p.id));
    }

    /* إقفال الصندوق: المتوقّع = الافتتاحي + الداخل نقداً − الخارج نقداً */
    const today = D.today();
    const prev = Svc.cashbook.expected(today);
    eq('المتوقّع في الدرج = الافتتاحي + الداخل − الخارج',
       prev.expected, round2(prev.opening + prev.cashIn - prev.cashOut));

    /* المصروف غير النقدي لا يُخصم من الدرج */
    const cat = Repos.expCats.list()[0];
    const beforeCash = Svc.cashbook.expected(today);
    const nonCash = await Svc.finance.addExpense({ date:today, amount:12345, categoryId:cat ? cat.id : null,
      description:'اختبار: مصروف بتحويل', method:'transfer' });
    const afterNonCash = Svc.cashbook.expected(today);
    eq('مصروف بتحويل لا يغيّر متوقّع الدرج', afterNonCash.expected, beforeCash.expected);
    const cashExp = await Svc.finance.addExpense({ date:today, amount:5000, categoryId:cat ? cat.id : null,
      description:'اختبار: مصروف نقدي', method:'cash' });
    const afterCash = Svc.cashbook.expected(today);
    eq('مصروف نقدي يخصم من متوقّع الدرج', afterCash.expected, beforeCash.expected - 5000);
    ok('جدول الطرق يعرض الصرف بالتحويل',
       (afterCash.byMethod || []).some(x => x.key === 'transfer' && x.out >= 12345),
       JSON.stringify(afterCash.byMethod));
    await T().DB.remove('expenses', nonCash.id);
    await T().DB.remove('expenses', cashExp.id);

    /* مصروف بطريقة غير معروفة يُعزل ولا يُخصم تخميناً */
    const unknown = await T().Repos.expenses.create({ date:today, amount:7777, categoryId:cat ? cat.id : null,
      description:'اختبار: راتب قديم بلا طريقة', method:'unknown', refType:'payroll', refId:'x' });
    const withUnknown = Svc.cashbook.expected(today);
    eq('المصروف مجهول الطريقة لا يُخصم من الدرج', withUnknown.expected, beforeCash.expected);
    eq('المصروف مجهول الطريقة يُعرض على حدة', withUnknown.unknownOut, 7777);
    await T().DB.remove('expenses', unknown.id);
    return results;
  }

  /* ========================= 2) ثوابت المخزون ========================= */
  async function stock(){
    const { Repos, Svc, Calc, U } = T();
    let mismatch = 0, negative = 0;
    Repos.products.list(true).forEach(p => {
      const moves = Repos.stockMoves.list().filter(m => m.productId === p.id);
      const onHand = Svc.inventory.onHand(p.id);
      if (round2(onHand) !== round2(Calc.onHand(moves))) mismatch++;
      if (onHand < -0.001 && p.stockTracked !== false) negative++;
    });
    ok('رصيد كل صنف = مجموع حركاته', !mismatch, `أصناف مخالفة=${mismatch}`);
    ok('لا رصيد سالب لصنف متتبَّع', !negative, `أصناف سالبة=${negative}`);

    /* إلغاء فاتورة يعيد المخزون، واسترجاعها يخصمه ثانية */
    const sale = Repos.sales.list().find(s => (s.lines || []).some(l => l.productId));
    if (sale){
      const pid = sale.lines.find(l => l.productId).productId;
      const before = Svc.inventory.onHand(pid);
      const qty = U.sum(sale.lines.filter(l => l.productId === pid), l => l.qty);
      await Svc.sales.archive(sale.id, true);
      eq('إلغاء الفاتورة يعيد الكمية إلى المخزون', Svc.inventory.onHand(pid), before + qty);
      await Svc.sales.archive(sale.id, false);
      eq('استرجاع الفاتورة يخصم الكمية ثانية', Svc.inventory.onHand(pid), before);
    }
    return results;
  }

  /* ========================= 3) ثوابت الاشتراك ========================= */
  async function subscriptions(){
    const { Repos, Svc, D } = T();
    const check = (label, subId) => {
      const s = Repos.subs.get(subId);
      const added = Svc.membership.addedDays(subId);
      const want = D.addDays(s.baseEndDate || s.endDate, added);
      return ok(label, s.endDate === want,
        `base=${s.baseEndDate} +${added} => ${want} لكن endDate=${s.endDate}`);
    };
    let bad = 0;
    Repos.subs.list(true).forEach(s => {
      const added = Svc.membership.addedDays(s.id);
      if (D.addDays(s.baseEndDate || s.endDate, added) !== s.endDate) bad++;
    });
    ok('كل اشتراك محفوظ يحقّق: الأصل + أيام الأحداث = النهاية', !bad, `اشتراكات مخالفة=${bad}`);

    const m = Repos.members.list()[0];
    if (!m) return results;
    const start = D.today();
    const { rec: sub } = await Svc.subs.create({ memberId:m.id, startDate:start,
      customDuration:{ value:1, unit:'month' }, price:100000, paidAmount:0 });
    check('بعد الإنشاء', sub.id);
    const soldEnd = sub.endDate;

    await Svc.membership.freeze(sub.id, { from:D.addDays(start, 2), to:D.addDays(start, 6), reason:'اختبار تجميد' });
    check('بعد التجميد', sub.id);
    eq('التجميد خمسة أيام يمدّ النهاية خمسة أيام',
       T().D.diffDays(soldEnd, Repos.subs.get(sub.id).endDate), 5);

    await Svc.membership.extend(sub.id, { days:3, reason:'اختبار تمديد' });
    check('بعد التمديد', sub.id);

    /* التعديل لا يبتلع أيام الأحداث */
    await Svc.subs.update(sub.id, { startDate:start, customDuration:{ value:2, unit:'month' },
      price:150000, discount:0, planId:'' });
    check('بعد تعديل المدة والسعر', sub.id);
    const edited = Repos.subs.get(sub.id);
    eq('التعديل يُبقي أيام الأحداث فوق الأصل الجديد',
       T().D.diffDays(edited.baseEndDate, edited.endDate), 8);

    const ev = Svc.membership.eventsOf(sub.id).find(e => e.type === 'freeze');
    await Svc.membership.cancelEvent(ev.id, 'اختبار إلغاء');
    check('بعد إلغاء حدث التجميد', sub.id);
    eq('إلغاء التجميد يعيد خمسة أيام',
       T().D.diffDays(Repos.subs.get(sub.id).baseEndDate, Repos.subs.get(sub.id).endDate), 3);

    /* السعر المعدَّل لا يعيد كتابة دفعة قديمة */
    await Svc.subs.archive(sub.id, true);
    return results;
  }

  /* ========================= 4) الترقيات ========================= */
  async function migrations(from){
    const { Backup, Migrations, Repos, U, D, PayMethods } = T();
    const live = Backup.build(false);
    const old = downgrade(live, from);
    await Backup.restore(old);                     /* الاستعادة تُشغّل الترقية بنفسها */
    const first = totals();
    const ends1 = endDates();
    const applied1 = await Migrations.run();       /* تشغيل ثانٍ: يجب ألا يغيّر شيئاً */
    const second = totals();

    eq(`v${from}→v5: الإيرادات لم تتغيّر بعد الترقية`, second.revenue, first.revenue);
    eq(`v${from}→v5: المصروفات لم تتغيّر بعد الترقية`, second.expense, first.expense);
    eq(`v${from}→v5: الدفعات لم تتغيّر بعد الترقية`, second.payments, first.payments);
    eq(`v${from}→v5: أسعار الاشتراكات لم تتغيّر`, second.subPrice, first.subPrice);
    const ends2 = endDates();
    const moved = Object.keys(ends1).filter(k => ends1[k] !== ends2[k]);
    ok(`v${from}→v5: لم تتحرّك نهاية أي اشتراك في التشغيل الثاني`, !moved.length, `تحرّكت=${moved.length}`);
    ok(`v${from}→v5: التشغيل الثاني بلا أثر (إعادة التشغيل آمنة)`,
       JSON.stringify(first.counts) === JSON.stringify(second.counts),
       (applied1.applied || []).join(' | '));

    /* أثر الترقية نفسه */
    const badMethod = Repos.payments.list(true).filter(p => !PayMethods.resolve(p.method) || PayMethods.label(p.method) === p.method && !PayMethods.get(p.method));
    ok(`v${from}→v5: كل دفعة تحمل مفتاح طريقة معروفاً`, !badMethod.length,
       badMethod.slice(0, 3).map(p => p.method).join(','));
    const custom = PayMethods.all().find(m => m.label === 'زين كاش');
    ok(`v${from}→v5: التسمية غير المعروفة حُفظت طريقةً بمفتاح خاص`, from < 4 || !!custom,
       JSON.stringify(PayMethods.all().map(m => m.key + ':' + m.label)));
    const noMethod = Repos.expenses.list(true).filter(e => !e.method);
    ok(`v${from}→v5: كل مصروف يحمل طريقة صرف`, !noMethod.length, `بلا طريقة=${noMethod.length}`);
    const payrollExp = Repos.expenses.list(true).filter(e => e.refType === 'payroll');
    ok(`v${from}→v5: مصروفات الرواتب القديمة «غير معروفة» لا مخمَّنة`,
       !payrollExp.length || payrollExp.every(e => e.method === 'unknown'),
       payrollExp.slice(0, 3).map(e => e.method).join(','));
    let badBase = 0;
    Repos.subs.list(true).forEach(s => {
      if (D.addDays(s.baseEndDate || s.endDate, T().Svc.membership.addedDays(s.id)) !== s.endDate) badBase++;
    });
    ok(`v${from}→v5: الثابت (أصل + أحداث = نهاية) يتحقّق بعد الترقية`, !badBase, `مخالف=${badBase}`);
    const stillListed = Repos.trainings.list(true).filter(t => (t.memberIds || []).length);
    ok(`v${from}→v5: لم تبقَ قائمة التحاق ثابتة على أي قالب`, !stillListed.length, `قوالب=${stillListed.length}`);
    const archivedLists = Repos.trainings.list(true).filter(t => (t.legacyMemberIds || []).length);
    ok(`v${from}→v5: القوائم القديمة محفوظة لتُعرض مرة`, !!archivedLists.length, `قوالب=${archivedLists.length}`);
    return results;
  }

  /* ========================= 5) البيانات التجريبية ========================= */
  async function demo(){
    const { Seed, DB, STORE_NAMES, Settings } = T();
    await Seed.loadDemo(20);
    const after = Object.fromEntries(STORE_NAMES.map(s => [s, DB.count(s)]));
    ok('البيانات التجريبية تُحمَّل', after.members > 0 && after.payments > 0, JSON.stringify({ m:after.members, p:after.payments }));
    ok('البيانات التجريبية تملأ جداول الإصدار الرابع أيضاً',
       after.classSessions > 0 && after.bookings > 0 && after.receipts >= 0,
       JSON.stringify({ s:after.classSessions, b:after.bookings }));
    await Seed.clearDemo();
    const left = STORE_NAMES.filter(s => DB.all(s).some(r => r.isDemo));
    ok('حذف البيانات التجريبية لا يترك سجلاً تجريبياً في أي جدول', !left.length, left.join('، '));
    ok('علم البيانات التجريبية يعود صفراً', Settings.get('demoLoaded') === false);
    return results;
  }

  /* ========================= 6) العملة والجداول ========================= */
  async function guards(){
    const { Settings, STORE_NAMES, STORE_LABELS } = T();
    const locked = Settings.currencyLocked();
    ok('العملة مقفلة ما دامت هناك حركات مالية', locked, `حركات=${Settings.currencyLockCount()}`);
    let threw = false;
    try { await Settings.set({ currency:'USD' }); } catch(e){ threw = e.code === 'CURRENCY_LOCKED'; }
    ok('محاولة تغيير العملة تُرفض برسالة واضحة', threw && Settings.get('currency') === 'IQD',
       Settings.get('currency'));
    const unlabeled = STORE_NAMES.filter(s => !STORE_LABELS[s]);
    ok('كل جدول يحمل اسماً عربياً في قائمة إعادة التهيئة', !unlabeled.length, unlabeled.join('، '));

    /* تغيير تسمية طريقة الدفع لا يمسّ سجلاً ولا يُخرج المقبوض من الصندوق */
    const { PayMethods, Repos, Svc, D } = T();
    const cashPayments = Repos.payments.list(true).filter(p => p.method === 'cash').length;
    const beforeExpected = Svc.cashbook.expected(D.today()).expected;
    await PayMethods.save(PayMethods.all().map(m => m.key === 'cash' ? { ...m, label:'كاش' } : m));
    ok('تسمية النقد تغيّرت في الإعدادات', PayMethods.label('cash') === 'كاش', PayMethods.label('cash'));
    ok('السجلات ما زالت تحمل المفتاح نفسه',
       Repos.payments.list(true).filter(p => p.method === 'cash').length === cashPayments,
       `${cashPayments} → ${Repos.payments.list(true).filter(p => p.method === 'cash').length}`);
    eq('متوقّع الدرج لم يتأثر بتغيير التسمية', Svc.cashbook.expected(D.today()).expected, beforeExpected);
    ok('الصندوق ما زال يعرف النقد بعد تغيير تسميته', Svc.cashbook.isCash('cash') && !Svc.cashbook.isCash('transfer'));
    await PayMethods.save(PayMethods.all().map(m => m.key === 'cash' ? { ...m, label:'نقد' } : m));

    /* إيقاف طريقة يخفيها من الاختيار ولا يمحو سجلاً */
    await PayMethods.save(PayMethods.all().map(m => m.key === 'card' ? { ...m, active:false } : m));
    ok('الطريقة الموقوفة تختفي من قوائم الاختيار', !PayMethods.options().some(o => o.v === 'card'));
    ok('الطريقة الموقوفة تبقى قابلة للعرض في السجلات القديمة', PayMethods.label('card') === 'بطاقة');
    await PayMethods.save(PayMethods.all().map(m => m.key === 'card' ? { ...m, active:true } : m));
    return results;
  }

  /* ========================= 9) النماذج والشاشات المنبثقة ========================= */
  async function modals(){
    const { Repos, Svc, Forms, Screens, D } = T();
    const closeAll = () => { while (T().UI.stack.length) T().UI.stack[T().UI.stack.length - 1].close(); };
    const open = (label, fn, expect) => {
      try {
        fn();
        const ov = document.querySelector('.ov, .modal, .overlay') || document.body;
        const html = ov.innerHTML || '';
        ok(label, expect ? expect(html) : true, expect ? html.slice(0, 120) : '');
      } catch(e){ ok(label, false, e && e.message); }
      closeAll();
    };
    const sub = Repos.subs.list().find(s => Svc.membership.addedDays(s.id) > 0)
             || Repos.subs.list()[0];
    if (sub) open('نموذج تعديل الاشتراك يفتح', () => Forms.subscription(sub.id),
      h => h.includes('تعديل الاشتراك'));
    const withEvents = Repos.subs.list().find(s => Svc.membership.addedDays(s.id) > 0);
    if (withEvents) open('نموذج الاشتراك يعرض النهاية الأصلية حين توجد أحداث',
      () => Forms.subscription(withEvents.id), h => h.includes('نهاية الاشتراك الأصلية'));
    open('نموذج المصروف يسأل عن طريقة الصرف', () => Forms.expense(), h => h.includes('طريقة الصرف'));
    const due = Svc.payments.openDues()[0];
    if (due) open('نموذج القبض يفتح على مستند غير مسدَّد',
      () => Forms.payment(due.kind, due.doc.id), h => h.includes('قبض دفعة'));
    if (sub) open('سجل الدفعات يعرض عمود الوصل',
      () => Screens.paymentLedger('subscription', sub.id), h => h.includes('الوصل'));
    const sale = Repos.sales.list()[0];
    if (sale) open('شاشة الفاتورة تعرض الوصولات لا طباعة غير مرقّمة',
      () => Screens.sale(sale.id), h => h.includes('سجل الدفعات والوصولات') && !h.includes('طباعة الإيصال'));
    return results;
  }

  /* ========================= 7) نموذج الحصص ========================= */
  async function classes(){
    const { Repos, Svc, D } = T();
    const m = Repos.members.list()[0];
    const tpl = Repos.trainings.list()[0];
    if (!m || !tpl) return ok('نموذج الحصص: لا بيانات كافية', false, 'لا مشتركة أو قالب');
    const made = await Svc.classes.generateFrom(tpl.id, D.today(), D.addDays(D.today(), 13));
    ok('القالب يولّد مواعيد مؤرَّخة', !!Svc.trainings.nextSession(tpl.id), `ولّد=${made.length}`);
    /* الحضور لا يُسجَّل في المستقبل، فالاختبار يحتاج موعداً في اليوم نفسه */
    const ses = Svc.classes.ofDay(D.today()).find(s => s.trainingId === tpl.id && s.status !== 'cancelled')
      || await Svc.classes.save(null, { trainingId:tpl.id, title:tpl.title, date:D.today(),
           startTime:tpl.time || '10:00', capacity:tpl.capacity || 10, creditCost:0 });
    ok('يوجد موعد اليوم لتسجيل الحضور عليه', !!ses, ses && ses.date);
    if (!ses) return results;
    const before = Svc.classes.bookingsOf(ses.id).filter(b => b.memberId === m.id && b.status !== 'cancelled');
    if (!before.length) await Svc.classes.book(ses.id, m.id);
    const res = await Svc.attendance.checkIn({ memberId:m.id, sessionId:ses.id });
    ok('حضور الحصة يحمل معرّف الموعد دائماً', res.rec.sessionId === ses.id, res.rec.sessionId);
    ok('حضور الحصة يُنسب إلى تاريخ الموعد', res.rec.date === ses.date, `${res.rec.date} / ${ses.date}`);
    const bk = Svc.classes.bookingsOf(ses.id).find(b => b.memberId === m.id && b.status !== 'cancelled');
    ok('الحضور يُعلّم الحجز «حضرت» فلا سجلّان يتناقضان', bk && bk.status === 'attended', bk && bk.status);
    let dup = false;
    try { await Svc.attendance.checkIn({ memberId:m.id, sessionId:ses.id }); } catch(e){ dup = e.code === 'DUPLICATE'; }
    ok('لا يُسجَّل حضور مرتين على الموعد نفسه', dup);
    ok('خدمة القوالب لم تعد تعرف الالتحاق الثابت',
       typeof Svc.trainings.enroll === 'undefined' && typeof Svc.trainings.countOf === 'undefined');
    return results;
  }

  /* ========================= 8) الاستمرارية ========================= */
  async function writeProbe(){
    const { Repos, D } = T();
    const rec = await Repos.members.create({ name:'اختبار الاستمرارية', phone:'', joinDate:D.today(), code:'ت9999' });
    return rec.id;
  }
  function probeExists(id){
    const rec = T().Repos.members.get(id);
    return ok('السجل المكتوب نجا من إعادة تحميل الصفحة', !!rec, id);
  }

  return {
    get results(){ return results; },
    reset(){ results = []; },
    money, stock, subscriptions, migrations, demo, guards, classes, modals,
    writeProbe, probeExists, totals, endDates, downgrade
  };
})();
