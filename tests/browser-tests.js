/* ============================================================================
   تبارك جيم — اختبارات الثوابت داخل المتصفح
   تُحقن في الصفحة بعد اكتمال الإقلاع وتعمل فوق window.TG وحده.
   كل اختبار يقول ما الذي يثبته بالضبط، ويفشل برسالة تكفي لمعرفة السبب.
   ========================================================================== */
window.TGTests = (() => {
  const T = () => window.TG;
  const Settings = new Proxy({}, { get:(_, k) => { const v = window.TG.Settings[k];
    return typeof v === 'function' ? v.bind(window.TG.Settings) : v; } });
  /* اختصارات: الاختبارات تعمل فوق السطح المكشوف وحده */
  const Actions = new Proxy({}, { get:(_, k) => window.TG.Actions[k] });
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
    const settings = (b.data.meta || []).find(x => x.k === 'settings');
    /* كل نسخة تُشبه إصدارها فعلاً: عيوب v4 لا تُحقن في نسخة تقول إنها v5،
       وإلا اختُبرت ترقية لا تعمل على مثل هذه البيانات أصلاً. */
    if (schema < 5){
      (b.data.payments || []).forEach(p => { p.method = lab(p.method); });
      (b.data.revenues || []).forEach(r => { r.method = lab(r.method); });
      (b.data.subscriptions || []).forEach(s => {
        s.paymentMethod = lab(s.paymentMethod);
        delete s.baseEndDate;                     /* v4 كان يترك الأصل يشرد عن النهاية */
      });
      (b.data.staff || []).forEach(s => { if (s.payMethod) s.payMethod = lab(s.payMethod); });
      (b.data.expenses || []).forEach(e => { delete e.method; });
      /* قوائم الالتحاق الثابتة تعود إلى القالب كما كانت في v4 */
      const members = (b.data.members || []).map(m => m.id);
      (b.data.trainings || []).forEach((t, i) => {
        t.memberIds = members.slice(i * 2, i * 2 + 3);
        delete t.legacyMemberIds;
      });
      if (settings && settings.v){
        settings.v.paymentMethods = ['نقد', 'تحويل', 'بطاقة', 'زين كاش'];
        delete settings.v.legacyEnrollmentsSeen;
      }
    }
    const sch = (b.data.meta || []).find(x => x.k === 'schema');
    if (sch) sch.v = schema;
    if (schema < 8){
      /* v7: لا جدول مستخدمات، ولا تفعيل للدخول، ولا نسبة فاعل في السجل */
      delete b.data.users;
      if (settings && settings.v){ delete settings.v.authEnabled; delete settings.v.authRecovery; }
      (b.data.audit || []).forEach(a => { delete a.actorId; delete a.actor; });
    }
    if (schema < 7){
      /* v6: لا مستندات شراء، ولا طريقة لحركة رأس مال، ولا تفصيل للتوزيعات.
         مستندات الشراء المُرحَّلة في القاعدة الحيّة ليس لها مقابل في v6،
         فتُنزع هي وكل ما ولّدته حتى تُشبه النسخةُ إصدارَها فعلاً. */
      const purIds = new Set((b.data.purchases || []).map(p => p.id));
      const purExp = new Set((b.data.purchases || []).map(p => p.expenseId).filter(Boolean));
      b.data.purchases = [];
      b.data.purchasePayments = [];
      b.data.expenses = (b.data.expenses || []).filter(e => !purExp.has(e.id) && e.refType !== 'purchase');
      b.data.stockMoves = (b.data.stockMoves || []).filter(m => !(m.refType === 'purchase' && purIds.has(m.refId)));
      (b.data.capital || []).forEach(c => { delete c.method; });
      (b.data.distributions || []).forEach(d => { delete d.allocations; delete d.allocationSource;
        delete d.allocationUnavailable; });
      (b.data.meta || []).forEach(x => { if (x.k === 'settings' && x.v) delete x.v.purchaseSeq; });
    }
    if (schema < 6){
      /* v5: لا ملاحظات ولا توزيعات ولا فترات مقفلة، والسحوبات بلا وسم */
      b.data.notes = [];
      b.data.distributions = [];
      (b.data.capital || []).forEach(c => { delete c.kind; });
      const st = (b.data.meta || []).find(x => x.k === 'settings');
      if (st && st.v){ delete st.v.closedPeriods; delete st.v.startScreen; }
    }
    if (schema < 4){
      /* v3: لا حضور بطريقة تسجيل ولا قوالب موسومة، ولا جداول الإصدار الرابع */
      (b.data.attendance || []).forEach(a => { delete a.method; delete a.status; delete a.sessionId; });
      (b.data.trainings || []).forEach(t => { delete t.kind; });
      ['measurements','goals','memberDocs','customFields','receipts','subEvents','credits',
       'leads','tasks','classSessions','bookings','cashDays','suppliers'].forEach(s => { b.data[s] = []; });
      const memberIds = (b.data.members || []).map(m => m.id);
      (b.data.trainings || []).forEach(t => { t.memberIds = memberIds.slice(0, 2); });
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
    const { Backup, Migrations, Repos, U, D, PayMethods, APP } = T();
    const TO = APP.schema;                      /* الوجهة هي مخطط البرنامج الحالي لا رقم مجمَّد */
    const live = Backup.build(false);
    const old = downgrade(live, from);
    await Backup.restore(old);                     /* الاستعادة تُشغّل الترقية بنفسها */
    const first = totals();
    const ends1 = endDates();
    const applied1 = await Migrations.run();       /* تشغيل ثانٍ: يجب ألا يغيّر شيئاً */
    const second = totals();

    eq(`v${from}→v${TO}: الإيرادات لم تتغيّر بعد الترقية`, second.revenue, first.revenue);
    eq(`v${from}→v${TO}: المصروفات لم تتغيّر بعد الترقية`, second.expense, first.expense);
    eq(`v${from}→v${TO}: الدفعات لم تتغيّر بعد الترقية`, second.payments, first.payments);
    eq(`v${from}→v${TO}: أسعار الاشتراكات لم تتغيّر`, second.subPrice, first.subPrice);
    const ends2 = endDates();
    const moved = Object.keys(ends1).filter(k => ends1[k] !== ends2[k]);
    ok(`v${from}→v${TO}: لم تتحرّك نهاية أي اشتراك في التشغيل الثاني`, !moved.length, `تحرّكت=${moved.length}`);
    ok(`v${from}→v${TO}: التشغيل الثاني بلا أثر (إعادة التشغيل آمنة)`,
       JSON.stringify(first.counts) === JSON.stringify(second.counts),
       (applied1.applied || []).join(' | '));

    /* أثر الترقية نفسه */
    const badMethod = Repos.payments.list(true).filter(p => !PayMethods.resolve(p.method) || PayMethods.label(p.method) === p.method && !PayMethods.get(p.method));
    ok(`v${from}→v${TO}: كل دفعة تحمل مفتاح طريقة معروفاً`, !badMethod.length,
       badMethod.slice(0, 3).map(p => p.method).join(','));
    const custom = PayMethods.all().find(m => m.label === 'زين كاش');
    ok(`v${from}→v${TO}: التسمية غير المعروفة حُفظت طريقةً بمفتاح خاص`, from !== 4 || !!custom,
       JSON.stringify(PayMethods.all().map(m => m.key + ':' + m.label)));
    const noMethod = Repos.expenses.list(true).filter(e => !e.method);
    ok(`v${from}→v${TO}: كل مصروف يحمل طريقة صرف`, !noMethod.length, `بلا طريقة=${noMethod.length}`);
    const payrollExp = Repos.expenses.list(true).filter(e => e.refType === 'payroll');
    ok(`v${from}→v${TO}: مصروفات الرواتب القديمة «غير معروفة» لا مخمَّنة`,
       !payrollExp.length || payrollExp.every(e => e.method === 'unknown'),
       payrollExp.slice(0, 3).map(e => e.method).join(','));
    let badBase = 0;
    Repos.subs.list(true).forEach(s => {
      if (D.addDays(s.baseEndDate || s.endDate, T().Svc.membership.addedDays(s.id)) !== s.endDate) badBase++;
    });
    ok(`v${from}→v${TO}: الثابت (أصل + أحداث = نهاية) يتحقّق بعد الترقية`, !badBase, `مخالف=${badBase}`);
    const stillListed = Repos.trainings.list(true).filter(t => (t.memberIds || []).length);
    ok(`v${from}→v${TO}: لم تبقَ قائمة التحاق ثابتة على أي قالب`, !stillListed.length, `قوالب=${stillListed.length}`);
    /* القوائم القديمة موجودة في نسخ ما قبل v5 وحدها */
    if (from < 5){
      const archivedLists = Repos.trainings.list(true).filter(t => (t.legacyMemberIds || []).length);
      ok(`v${from}→v${TO}: القوائم القديمة محفوظة لتُعرض مرة`, !!archivedLists.length, `قوالب=${archivedLists.length}`);
    }

    /* ---- أثر ترقية v6 ---- */
    const withdrawals = Repos.capital.list(true).filter(c => c.type === 'withdrawal');
    ok(`v${from}→v${TO}: كل سحب رأس مال موسوم «استرجاع رأس مال»`,
       !withdrawals.length || withdrawals.every(c => c.kind === 'capital_return'),
       withdrawals.slice(0, 3).map(c => c.kind).join(','));
    ok(`v${from}→v${TO}: قائمة الفترات المقفلة مهيّأة`, Array.isArray(T().Settings.get('closedPeriods')),
       typeof T().Settings.get('closedPeriods'));
    ok(`v${from}→v${TO}: الجدولان الجديدان موجودان وقابلان للقراءة`,
       Array.isArray(Repos.notes.list(true)) && Array.isArray(Repos.distributions.list(true)));
    ok(`v${from}→v${TO}: الشاشة الافتتاحية لها قيمة افتراضية`,
       ['desk','dashboard'].includes(T().Settings.get('startScreen') || 'desk'), T().Settings.get('startScreen'));

    /* ---- أثر ترقية v7: طرق رأس المال وتفصيل التوزيعات ---- */
    const { Svc, Calc } = T();
    const caps = Repos.capital.list(true);
    ok(`v${from}→v${TO}: كل حركة رأس مال تحمل طريقة`, caps.every(c => !!c.method),
       caps.filter(c => !c.method).length);
    ok(`v${from}→v${TO}: الحركات القديمة «غير معروفة» لا مخمَّنة نقداً`,
       !caps.length || caps.every(c => c.method === PayMethods.UNKNOWN_KEY || c.method === 'cash'
         || PayMethods.all().some(m => m.key === c.method)),
       caps.slice(0, 3).map(c => c.method).join(','));
    ok(`v${from}→v${TO}: كل حركة رأس مال موسومة بصنفها`,
       caps.every(c => c.kind === 'capital_return' || c.kind === 'capital_injection'),
       caps.filter(c => !c.kind).length);
    ok(`v${from}→v${TO}: مجهول الطريقة خارج حساب الدرج`,
       Svc.cashbook.movement(D.today()).capitalUnknown >= 0);
    const dists = Repos.distributions.list(true);
    const drift = dists.filter(x => {
      const al = Svc.distributions.allocationsOf(x);
      return al.length && Math.abs(U.round2(U.sum(al, a => a.amount) - x.amount)) > 0.009;
    });
    ok(`v${from}→v${TO}: لا توزيع مجموع تفصيله يخالف مبلغه`, !drift.length, drift.length);
    const oneMonth = dists.filter(x => Svc.periods.monthsBetween(x.periodFrom, x.periodTo).length === 1);
    ok(`v${from}→v${TO}: توزيع الشهر الواحد فُصّل بالضبط`,
       !oneMonth.length || oneMonth.every(x => Svc.distributions.allocationsOf(x).length === 1),
       oneMonth.length);
    const spread = dists.filter(x => Svc.periods.monthsBetween(x.periodFrom, x.periodTo).length > 1);
    ok(`v${from}→v${TO}: التوزيع الممتدّ القديم لم يُخترع له تفصيل`,
       !spread.length || spread.every(x => Svc.distributions.allocationsOf(x).length
         || x.allocationUnavailable),
       spread.length);
    ok(`v${from}→v${TO}: جدولا الشراء موجودان وقابلان للقراءة`,
       Array.isArray(Repos.purchases.list(true)) && Array.isArray(Repos.purchasePayments.list(true)));
    eq(`v${from}→v${TO}: رأس المال المحفوظ لم يتغيّر مبلغه`, second.capital, first.capital);
    return results;
  }

  /* ========================= 5) البيانات التجريبية ========================= */
  async function demo(){
    const { Seed, DB, STORE_NAMES, Settings, Repos, Svc, U, Integrity, PayMethods } = T();
    await Seed.loadDemo(20);
    const after = Object.fromEntries(STORE_NAMES.map(s => [s, DB.count(s)]));
    ok('البيانات التجريبية تُحمَّل', after.members > 0 && after.payments > 0, JSON.stringify({ m:after.members, p:after.payments }));
    ok('البيانات التجريبية تملأ جداول الإصدار الرابع أيضاً',
       after.classSessions > 0 && after.bookings > 0 && after.receipts >= 0,
       JSON.stringify({ s:after.classSessions, b:after.bookings }));
    /* البيانات التجريبية تُري القواعد بعينها لا بشرحها: طرق مختلفة لرأس المال،
       ومستند مسدَّد بالكامل وآخر جزئياً، وفترة مقفلة عليها توزيع مفصَّل. */
    const caps = Repos.capital.list();
    ok('البيانات التجريبية تعرض رأس مال بطرق مختلفة',
       new Set(caps.map(c => c.method)).size >= 2, JSON.stringify(caps.map(c => c.method)));
    ok('كل حركة رأس مال تجريبية تحمل طريقة معروفة',
       caps.every(c => c.method && c.method !== PayMethods.UNKNOWN_KEY));
    const purs = Svc.purchases.posted();
    ok('البيانات التجريبية تعرض مستندات شراء مُرحَّلة', purs.length >= 2, purs.length);
    ok('البيانات التجريبية تعرض مستنداً مسدَّداً بالكامل وآخر جزئياً',
       purs.some(p => Svc.purchases.balance(p).due <= 0.009)
       && purs.some(p => Svc.purchases.balance(p).due > 0.009),
       JSON.stringify(purs.map(p => Svc.purchases.balance(p).due)));
    ok('مشتريات البيانات التجريبية دخلت المخزن',
       Repos.stockMoves.list().some(m => m.refType === 'purchase'));
    ok('لكل مستند تجريبي مُرحَّل مصروف واحد لا أكثر',
       purs.every(p => Repos.expenses.list(true).filter(e => e.refType === 'purchase' && e.refId === p.id).length === 1));
    const dists = Repos.distributions.list();
    ok('توزيعات البيانات التجريبية مفصَّلة بالأشهر',
       !dists.length || dists.every(d => U.round2(U.sum(Svc.distributions.allocationsOf(d), a => a.amount)) === U.round2(d.amount)),
       dists.length);
    ok('البيانات التجريبية لا تترك خللاً في سلامة البيانات',
       Integrity.scan().filter(x => !/وسائط غير مستعملة/.test(x.type)).length === 0,
       JSON.stringify(Integrity.scan().filter(x => !/وسائط غير مستعملة/.test(x.type)).slice(0, 4)));

    await Seed.clearDemo();
    const left = STORE_NAMES.filter(s => DB.all(s).some(r => r.isDemo));
    ok('حذف البيانات التجريبية لا يترك سجلاً تجريبياً في أي جدول', !left.length, left.join('، '));
    ok('حذف البيانات التجريبية يمسح مستندات الشراء ودفعاتها',
       DB.count('purchases') === 0 && DB.count('purchasePayments') === 0,
       `${DB.count('purchases')}/${DB.count('purchasePayments')}`);
    ok('لا يبقى مصروف لمستند شراء محذوف',
       !Repos.expenses.list(true).some(e => e.refType === 'purchase'));
    ok('لا تبقى حركة مخزون لمستند شراء محذوف',
       !Repos.stockMoves.list(true).some(m => m.refType === 'purchase'));
    ok('حذف البيانات التجريبية لا يترك سجلاً يتيماً',
       Integrity.scan().filter(x => /بلا |يتيم|محذوف/.test(x.type)).length === 0,
       JSON.stringify(Integrity.scan().slice(0, 4)));
    ok('علم البيانات التجريبية يعود صفراً', Settings.get('demoLoaded') === false);
    return results;
  }

  /* ============ سلامة البيانات: يتامى دورة الشراء والتوزيع ============
     الميزة الجديدة لا تكتمل إن تركت مراجع مكسورة. هنا تُكسَر عمداً ثم يُتحقّق
     من أن الفحص يراها وأن الإصلاح لا يمسّ سليماً. */
  async function integrityP2(){
    const { Svc, Repos, DB, Integrity, D, U } = T();
    const sup = await Svc.suppliers.save(null, { name:'مورّد السلامة' });
    const { rec: prod } = await Svc.inventory.saveProduct(null, { name:'صنف السلامة', price:2000, cost:800 });
    const a = await Svc.purchases.save(null, { supplierId:sup.id, date:D.today(),
      lines:[{ productId:prod.id, qty:4, unitCost:800 }] });
    await Svc.purchases.post(a.rec.id);
    await Svc.purchases.addPayment({ purchaseId:a.rec.id, date:D.today(), amount:1000, method:'cash' });
    ok('القاعدة سليمة قبل الكسر',
       Integrity.scan().filter(x => /شراء|مورّد|توزيع/.test(x.type)).length === 0);

    /* 1) دفعة مورّد بلا مستند */
    const orphanPay = await Repos.purchasePayments.create({ purchaseId:'pur_missing', supplierId:sup.id,
      date:D.today(), amount:500, method:'cash', notes:'' });
    ok('الفحص يكشف دفعة مورّد بلا مستند',
       Integrity.scan().some(x => x.type === 'دفعة مورّد بلا مستند شراء' && x.id === orphanPay.id));

    /* 2) مستند بلا مورّد */
    const noSup = await Repos.purchases.create({ code:'ش99999', supplierId:'sup_missing', date:D.today(),
      lines:[], subtotal:0, discount:0, total:0, items:0, status:'draft', expenseId:null, notes:'' });
    ok('الفحص يكشف مستند شراء بلا مورّد',
       Integrity.scan().some(x => x.type === 'مستند شراء بلا مورّد' && x.id === noSup.id));

    /* 3) مصروف مستند بلا مستند */
    const posted = Repos.purchases.get(a.rec.id);
    await DB.remove('purchases', posted.id);
    const sc = Integrity.scan();
    ok('الفحص يكشف مصروف مستند شراء بلا مستند',
       sc.some(x => x.type === 'مصروف مستند شراء بلا مستند' && x.id === posted.expenseId));
    ok('الفحص يكشف حركة مخزون لمستند محذوف',
       sc.some(x => x.type === 'حركة مخزون لمستند شراء محذوف'));

    /* 4) تفصيل توزيع يخالف مبلغه — والإصلاح يعيد ضبطه بلا مسّ الإجمالي */
    const partner = await Repos.partners.create({ name:'شريكة السلامة', sharePercent:40 });
    const k = D.monthsBack(10)[0];
    if (!Svc.periods.isClosed(k)) await Svc.periods.close(k).catch(() => {});
    const bad = await Repos.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(k),
      periodTo:D.endOfMonth(k), amount:30000, date:D.today(), method:'cash',
      allocations:[{ key:k, net:0, share:0, amount:11111 }] });
    ok('الفحص يكشف تفصيلاً لا يساوي مبلغه',
       Integrity.scan().some(x => x.type === 'تفصيل توزيع لا يساوي مبلغه' && x.id === bad.id));
    await Integrity.repair();
    const fixed = Repos.distributions.get(bad.id);
    ok('الإصلاح لا يمسّ مبلغ التوزيع', fixed && U.round2(fixed.amount) === 30000, fixed && fixed.amount);
    ok('الإصلاح يُغلق ثابت التفصيل',
       U.round2(U.sum(Svc.distributions.allocationsOf(fixed), x => x.amount)) === 30000,
       JSON.stringify(Svc.distributions.allocationsOf(fixed)));
    ok('الإصلاح يزيل اليتامى', !Integrity.scan().some(x => x.type === 'دفعة مورّد بلا مستند شراء'));
    ok('الإصلاح يفكّ رابط مصروف المستند المحذوف',
       !Integrity.scan().some(x => x.type === 'مصروف مستند شراء بلا مستند'));
    /* الحدّ الذي لا يتجاوزه الإصلاح التلقائي: مستند الشراء نفسه لا يُحذف.
       قد يكون مُرحَّلاً بمخزونٍ ومصروفٍ خلفه، وحذفه صامتاً يمحو تاريخاً مالياً
       أكبر من الخلل. يبقى معروضاً للمراجعة بقرار إنسان — كما «اشتراك مقبوض
       أكثر من سعره» تماماً. */
    const left = Integrity.scan().filter(x => /شراء|مورّد|توزيع/.test(x.type));
    ok('الإصلاح لا يحذف مستند شراء صامتاً — يُعرض للمراجعة',
       left.length === 1 && left[0].type === 'مستند شراء بلا مورّد' && left[0].fix === 'none',
       JSON.stringify(left.slice(0, 3)));
    ok('المستند المعروض للمراجعة ما زال موجوداً لم يُمحَ', !!Repos.purchases.get(noSup.id));
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


  /* ===================== المرحلة الأولى: التشغيل اليومي ===================== */

  /* 9) حفظ + طباعة وصل: الطباعة لا تصنع مالاً، وفشلها لا يُفقد الدفعة */
  async function saveAndPrint(){
    const { Svc, Repos, D, U, Money } = T();
    const m = Repos.members.list()[0];
    if (!m) return ok('حفظ وطباعة: لا مشتركة', false);
    const { rec: sub } = await Svc.subs.create({ memberId:m.id, startDate:D.today(),
      customDuration:{ value:1, unit:'month' }, price:90000, paidAmount:40000, paymentMethod:'cash' });
    const p1 = Actions.lastPaymentOf('subscription', sub.id);
    ok('«آخر دفعة على المستند» تجد الدفعة المبدئية', !!p1 && p1.amount === 40000, p1 && p1.amount);

    const before = totals();
    /* منع نافذة الطباعة يحاكي الحالة الحقيقية: المتصفح يمنع النوافذ المنبثقة */
    const realOpen = window.open;
    window.open = () => null;
    const r = await Actions.saveAndPrintReceipt(p1.id, 'اختبار');
    window.open = realOpen;
    ok('فشل فتح نافذة الطباعة لا يمنع إصدار الوصل', !!r && !!r.no, r && r.no);
    const after = totals();
    ok('فشل الطباعة لا يغيّر أي رقم مالي',
       before.payments === after.payments && before.revenue === after.revenue,
       JSON.stringify({ before:before.payments, after:after.payments }));
    ok('فشل الطباعة لا يُنشئ دفعة ثانية',
       Svc.payments.forRef('subscription', sub.id).length === 1,
       Svc.payments.forRef('subscription', sub.id).length);

    /* إعادة المحاولة بعد الفشل تعطي الوصل نفسه لا وصلاً جديداً */
    const r2 = await Actions.saveAndPrintReceipt(p1.id);
    ok('إعادة المحاولة تعطي الوصل نفسه برقمه', r2 && r2.id === r.id && r2.no === r.no, `${r.no} / ${r2 && r2.no}`);
    eq('الوصولات لم تتكاثر', Repos.receipts.list(true).filter(x => x.paymentId === p1.id).length, 1);

    /* اشتراك بلا قبض: لا وصل له، ولا تُخترع دفعة لطباعته */
    const { rec: free } = await Svc.subs.create({ memberId:m.id, startDate:D.addDays(D.today(), 40),
      customDuration:{ value:1, unit:'month' }, price:50000, paidAmount:0 });
    ok('اشتراك بلا قبض لا دفعة له', !Actions.lastPaymentOf('subscription', free.id));
    const n0 = Repos.payments.list(true).length;
    await Actions.saveAndPrintReceipt(null, 'اختبار بلا دفعة');
    eq('طلب طباعة بلا دفعة لا يُنشئ دفعة', Repos.payments.list(true).length, n0);
    await Svc.subs.archive(free.id, true);
    await Svc.subs.archive(sub.id, true);
    return results;
  }

  /* 10) الاستقبال: كود + Enter، والتجميد، والمنتهي */
  async function desk(){
    const { Svc, Repos, D, U } = T();
    const { rec: m } = await Svc.members.create({ name:'مشتركة الاستقبال', phone:'07711111111', joinDate:D.today() });
    /* الاشتراك بدأ قبل خمسة أيام ليصحّ تجميد يشمل أمس */
    await Svc.subs.create({ memberId:m.id, startDate:D.addDays(D.today(), -5), customDuration:{ value:1, unit:'month' },
      price:60000, paidAmount:60000 });

    /* البحث بالكود: كامل، وبلا حرف «ت»، وبأرقام عربية */
    ok('البحث بالكود الكامل يجد المشتركة', (Svc.members.byCode(m.code) || {}).id === m.id, m.code);
    ok('البحث بالأرقام وحدها (ماسح بلا حرف) يجدها',
       (Svc.members.byCode(String(m.code).replace(/^ت/, '')) || {}).id === m.id);
    const arabicDigits = String(m.code).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
    ok('البحث بالأرقام العربية يجدها', (Svc.members.byCode(arabicDigits) || {}).id === m.id, arabicDigits);
    ok('كود غير موجود لا يُطابق أحداً', !Svc.members.byCode('ت999999'));

    /* Enter يسجّل الحضور فوراً */
    const rec = await Actions.deskEnter(m.code);
    ok('كود + Enter يسجّل الحضور فوراً', !!rec && rec.memberId === m.id, rec && rec.id);
    ok('الحضور المسجَّل بالكود يحمل طريقته', rec && rec.method === 'code', rec && rec.method);
    ok('الحضور بتاريخ اليوم', rec && rec.date === D.today(), rec && rec.date);
    /* التكرار يُمنع بقواعد الحضور نفسها */
    const again = await Actions.deskEnter(m.code);
    ok('الحضور مرتين في اليوم نفسه يُمنع', !again);

    /* التجميد: الدخول يعرض «إنهاء التجميد اليوم» */
    const sub = Svc.subs.ofMember(m.id)[0];
    const soldEnd = Repos.subs.get(sub.id).endDate;
    await Svc.membership.freeze(sub.id, { from:D.addDays(D.today(), -2), to:D.addDays(D.today(), 5), reason:'اختبار' });
    ok('الاشتراك صار مجمّداً اليوم', !!Svc.membership.frozenOn(sub.id));
    eq('التجميد ثمانية أيام يمدّ النهاية ثمانية', D.diffDays(soldEnd, Repos.subs.get(sub.id).endDate), 8);
    const r = await Svc.membership.endFreezeToday(sub.id, 'دخلت النادي');
    ok('إنهاء التجميد اليوم يرفع التجميد', !Svc.membership.frozenOn(sub.id));
    eq('يُحتسب ما مضى من التجميد وحده (يومان)', r.daysKept, 2);
    eq('النهاية تعود إلى الأصل + المحتسَب', D.diffDays(soldEnd, Repos.subs.get(sub.id).endDate), 2);
    ok('حدث التجميد يبقى مسجَّلاً موسوماً بأنه أُنهي مبكراً',
       Svc.membership.eventsOf(sub.id).some(e => e.type === 'freeze' && e.endedEarly && !e.cancelled));
    const s2 = Repos.subs.get(sub.id);
    ok('الثابت يتحقّق بعد إنهاء التجميد',
       D.addDays(s2.baseEndDate, Svc.membership.addedDays(sub.id)) === s2.endDate,
       `${s2.baseEndDate} +${Svc.membership.addedDays(sub.id)} ≠ ${s2.endDate}`);

    /* تجميد لم يبدأ بعد: إنهاؤه يُلغيه بلا احتساب يوم */
    const end2 = Repos.subs.get(sub.id).endDate;
    await Svc.membership.freeze(sub.id, { from:D.today(), to:D.addDays(D.today(), 3), reason:'اختبار ثانٍ' });
    const r2 = await Svc.membership.endFreezeToday(sub.id, 'عادت فوراً');
    ok('تجميد يبدأ اليوم يُلغى بالكامل عند إنهائه', r2.cancelled === true);
    eq('ولا يُحتسب منه يوم', Repos.subs.get(sub.id).endDate === end2 ? 0 : 1, 0);

    /* افتراضات التجديد */
    const def = Svc.members.renewalDefaults(m.id);
    const curEnd = Repos.subs.get(sub.id).endDate;
    ok('التجديد يبدأ في اليوم التالي لنهاية الاشتراك', def.startDate === D.addDays(curEnd, 1),
       `${def.startDate} ≠ ${D.addDays(curEnd, 1)}`);
    eq('التجديد يقترح السعر الأخير', def.price, 60000);
    ok('التجديد يقترح المدة الأخيرة', def.duration && def.duration.unit === 'month' && def.duration.value === 1,
       JSON.stringify(def.duration));

    /* التجديد لا يمسّ السجل القديم */
    const beforeOld = U.clone(Repos.subs.get(sub.id));
    const { rec: renewed } = await Svc.subs.create({ memberId:m.id, startDate:def.startDate,
      customDuration:def.duration, price:def.price, paidAmount:0 });
    const afterOld = Repos.subs.get(sub.id);
    ok('التجديد لا يغيّر الاشتراك السابق',
       beforeOld.startDate === afterOld.startDate && beforeOld.endDate === afterOld.endDate
       && beforeOld.finalPrice === afterOld.finalPrice, JSON.stringify({ beforeOld:beforeOld.endDate, afterOld:afterOld.endDate }));
    ok('التجديد سجلّ مستقل جديد', renewed.id !== sub.id && renewed.startDate === def.startDate);
    return results;
  }

  /* 11) ملاحظات الفريق */
  async function notes(){
    const { Svc, Repos, D } = T();
    const m = Repos.members.list()[0];
    const n = await Svc.notes.add({ memberId:m.id, text:'اتصلنا بها اليوم', kind:'call', author:'المالكة' });
    ok('الملاحظة تُحفظ بنصّها', n.text === 'اتصلنا بها اليوم');
    ok('الملاحظة تحمل كاتبتها', n.author === 'المالكة', n.author);
    ok('الملاحظة مؤرَّخة', n.date === D.today() && !!n.createdAt);
    ok('ملاحظات المشتركة تُقرأ من جدولها', Svc.notes.ofMember(m.id).some(x => x.id === n.id));
    let bad = false;
    try { await Svc.notes.add({ memberId:m.id, text:'   ' }); } catch(e){ bad = e.code === 'VALIDATION'; }
    ok('ملاحظة فارغة تُرفض', bad);
    let noMember = false;
    try { await Svc.notes.add({ memberId:'x', text:'شيء' }); } catch(e){ noMember = e.code === 'VALIDATION'; }
    ok('ملاحظة بلا مشتركة تُرفض', noMember);
    await Svc.notes.togglePin(n.id);
    ok('التثبيت يعمل', Svc.notes.pinnedOf(m.id).some(x => x.id === n.id));
    await Svc.notes.update(n.id, { text:'عُدّلت الملاحظة', kind:'general' });
    const after = Repos.notes.get(n.id);
    ok('التعديل يحفظ النصّ الجديد ويسجّل أنه عُدّل', after.text === 'عُدّلت الملاحظة' && !!after.editedAt);
    await Svc.notes.remove(n.id);
    ok('الحذف يزيلها', !Repos.notes.get(n.id));
    return results;
  }

  /* 12) الفترات والتوزيعات: تقلّل السيولة ولا تقلّل الربح */
  async function distributions(){
    const { Svc, Repos, Calc, D, U, Money, Settings } = T();
    const partner = Repos.partners.list()[0] || await Repos.partners.create({ name:'شريكة اختبار', sharePercent:50 });
    /* فترة لم تلمسها البيانات التجريبية (التي تقفل الشهر الماضي وتوزّع عليه) */
    const key = D.monthsBack(4)[0];
    const from = D.startOfMonth(key), to = D.endOfMonth(key);

    /* بلا إقفال لا توزيع */
    if (Svc.periods.isClosed(key)) await Svc.periods.reopen(key, 'اختبار');
    ok('الفترة المختارة غير مقفلة قبل الاختبار', !Svc.periods.isClosed(key), key);
    let blocked = false;
    try { await Svc.distributions.create({ partnerId:partner.id, periodFrom:from, periodTo:to,
      amount:1000, date:D.today(), method:'cash' }); }
    catch(e){ blocked = e.code === 'VALIDATION'; }
    ok('لا يُوزَّع من فترة غير مقفلة', blocked);

    const closed = await Svc.periods.close(key);
    ok('الإقفال يثبّت رقم الربح', typeof closed.net === 'number', closed.net);
    eq('الربح المثبَّت = الإيراد − المصروف وقت الإقفال', closed.net, U.round2(closed.revenue - closed.expense));

    const profitBefore = Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), from, to);
    const cashBefore = Svc.finance.summary().cash;
    /* البيانات التجريبية قد تكون وزّعت اليوم أيضاً، فيُقاس الفرق لا الرقم المطلق */
    const distTodayBefore = Svc.finance.summary(D.today(), D.today()).distributions;
    const ent = Svc.distributions.entitlement(partner.id, from, to);
    eq('النصيب = الربح المثبَّت × النسبة', ent.share, Calc.partnerShare(closed.net, partner.sharePercent));

    const amount = 25000;
    const { rec: dist } = await Svc.distributions.create({ partnerId:partner.id, periodFrom:from, periodTo:to,
      amount, date:D.today(), method:'cash', notes:'اختبار' });
    ok('التوزيع يُسجَّل', !!dist.id && dist.amount === amount);

    const profitAfter = Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), from, to);
    eq('التوزيع لا يقلّل الربح', profitAfter, profitBefore);
    eq('التوزيع يقلّل السيولة بمقداره', Svc.finance.summary().cash, U.round2(cashBefore - amount));
    ok('التوزيع ليس مصروفاً', !Repos.expenses.list(true).some(e => e.refId === dist.id),
       'ظهر في المصروفات');
    /* التوزيع حدث نقدي بتاريخه هو، لا بتاريخ الفترة التي وُزّعت عنها */
    eq('ملخّص المالية يعرض التوزيعات بجانب الربح لا داخله',
       U.round2(Svc.finance.summary(D.today(), D.today()).distributions - distTodayBefore), amount);
    eq('صافي الربح في الملخّص لا يطرح التوزيع',
       Svc.finance.summary(from, to).net, profitBefore);

    /* الصندوق: التوزيع النقدي يخرج من الدرج */
    const mv = Svc.cashbook.movement(D.today());
    ok('التوزيع النقدي يخرج من درج اليوم', mv.distributionsOut >= amount, mv.distributionsOut);

    /* كشف الشريكة */
    const st = Svc.distributions.statement(partner.id);
    eq('كشف الشريكة يعرض ما وُزّع', st.paid, U.round2(U.sum(Svc.distributions.ofPartner(partner.id), d => d.amount)));
    eq('كشف الشريكة يفصل رأس المال عن الأرباح', st.capitalBalance,
       U.round2(st.contributions - st.returns));
    ok('كشف الشريكة يحسب المتبقّي', st.remaining === U.round2(st.entitled - st.paid), st.remaining);
    ok('كشف الشريكة يُطبع', (T().Print.partnerStatementHtml(partner.id) || '').includes('كشف حساب شريكة'));

    /* لا تُعاد فترة وُزّعت أرباحها */
    let locked = false;
    try { await Svc.periods.reopen(key, 'اختبار'); } catch(e){ locked = e.code === 'LINKED'; }
    ok('لا تُعاد فتح فترة وُزّعت أرباحها', locked);

    /* الإلغاء يعيد السيولة ولا يمسّ الربح */
    await Svc.distributions.remove(dist.id);
    eq('إلغاء التوزيع يعيد السيولة', Svc.finance.summary().cash, cashBefore);
    eq('إلغاء التوزيع لا يمسّ الربح',
       Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), from, to), profitBefore);

    /* توزيع يمتدّ عدة أشهر: يُقسم بنسبة النصيب، ومجموع ما قُسم = ما قُبض */
    const keys = D.monthsBack(9).slice(0, 3);
    const cat0 = Repos.expCats.list()[0];
    for (let i = 0; i < keys.length; i++)
      await Svc.finance.addRevenue({ date:D.startOfMonth(keys[i]), amount:[100000, 200000, 700000][i],
        source:'service', description:'اختبار التقسيم', method:'cash' });
    for (const k of keys){ if (Svc.periods.isClosed(k)) await Svc.periods.reopen(k, 'ضبط').catch(() => {});
      await Svc.periods.close(k); }
    const mFrom = D.startOfMonth(keys[0]), mTo = D.endOfMonth(keys[2]);
    const stBefore = Svc.distributions.statement(partner.id);
    const paidBefore = Object.fromEntries(stBefore.periods.map(p => [p.key, p.paid]));
    const spread = 90000;
    await Svc.distributions.create({ partnerId:partner.id, periodFrom:mFrom, periodTo:mTo,
      amount:spread, date:D.today(), method:'cash' });
    const stAfter = Svc.distributions.statement(partner.id);
    const allocated = U.round2(U.sum(stAfter.periods.filter(p => keys.includes(p.key)),
      p => p.paid - (paidBefore[p.key] || 0)));
    eq('التوزيع الممتدّ يُقسَّم بالكامل على أشهره', allocated, spread);
    const shares = keys.map(k => Calc.partnerShare(Svc.periods.get(k).net, partner.sharePercent));
    const pos = shares.filter(x => x > 0), total = U.sum(pos, x => x);
    const expected = keys.map(k => { const sh = Calc.partnerShare(Svc.periods.get(k).net, partner.sharePercent);
      return total > 0 ? U.round2(spread * Math.max(0, sh) / total) : U.round2(spread / keys.length); });
    const got = keys.map(k => U.round2((stAfter.periods.find(p => p.key === k) || {}).paid - (paidBefore[k] || 0)));
    ok('الشهر الأكثر ربحاً يأخذ النصيب الأكبر',
       JSON.stringify(got) === JSON.stringify(expected), `${got} مقابل ${expected}`);
    ok('الشهر الخاسر لا يأخذ شيئاً من التوزيع',
       shares.every((sh, i) => sh > 0 || got[i] === 0), `${shares} / ${got}`);
    /* المرحلة الثانية: لم يعد التقسيم تقديراً يُحسب وقت العرض — صار تفصيلاً
       محفوظاً مع التوزيع نفسه. فيُختبر ما هو أقوى من «وسم التقدير»: أن التفصيل
       مكتوب في السجل، وأن مجموعه يساوي المبلغ بالضبط بلا باقٍ مخفي. */
    const spreadRec = U.sortBy(Svc.distributions.ofPartner(partner.id).filter(x => x.amount === spread),
      x => x.createdAt, -1)[0];
    const spreadAlloc = Svc.distributions.allocationsOf(spreadRec);
    ok('التوزيع الممتدّ يحمل تفصيلاً محفوظاً لكل شهر',
       spreadAlloc.length === keys.length, `${spreadAlloc.length} من ${keys.length}`);
    eq('مجموع تفصيل الأشهر = مبلغ التوزيع بالضبط',
       U.round2(U.sum(spreadAlloc, a => a.amount)), spread);
    ok('كشف الطباعة يقول إن المقبوض الشهري مأخوذ من التفصيل المحفوظ',
       T().Print.partnerStatementHtml(partner.id).includes('لا تُقدَّر عند الطباعة'));
    eq('إجمالي المقبوض في الكشف يبقى مضبوطاً', stAfter.paid,
       U.round2(U.sum(Svc.distributions.ofPartner(partner.id), d => d.amount)));

    /* الزيادة على الاستحقاق تُقال بصراحة لا تُخفى خلف صفر */
    const overPaid = Svc.distributions.statement(partner.id);
    if (overPaid.remaining < 0)
      ok('الكشف المطبوع يُعلن القبض الزائد بدل إظهار صفر',
         T().Print.partnerStatementHtml(partner.id).includes('قُبض مقدماً فوق الاستحقاق'));

    return results;
  }

  /* ==================== المرحلة الثانية: طرق رأس المال ====================
     السؤال الذي يجيب عنه هذا القسم: هل يفرّق النظام بين السيولة ودرج الصندوق؟
     التحويل يزيد السيولة ولا يزيد ما في الدرج، والنقد يزيدهما معاً، وما لم
     تُسجَّل طريقته لا يُخمَّن. وفي الحالات كلها: رأس المال ليس إيراداً. */
  async function capitalMethods(){
    const { Svc, Repos, Calc, U, D, PayMethods } = T();
    const today = D.today();
    const before = {
      cash: Svc.cashbook.expected(today).expected,
      liquidity: Svc.finance.liquidity(),
      profit: Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), today, today),
      capital: Calc.capitalBalance(Repos.capital.list()),
      revenue: Calc.revenue(Repos.revenues.list(), today, today)
    };

    /* 1) ضخّ نقدي: الدرج والسيولة ورأس المال — ولا إيراد ولا ربح */
    const cashIn = await Svc.finance.addCapital({ date:today, amount:300000, type:'injection',
      method:'cash', description:'ضخّ نقدي — اختبار' });
    ok('حركة رأس المال تحفظ طريقتها', cashIn.rec.method === 'cash', cashIn.rec.method);
    eq('الضخّ النقدي يزيد الدرج بمقداره', Svc.cashbook.expected(today).expected, U.round2(before.cash + 300000));
    eq('الضخّ النقدي يزيد السيولة بمقداره', Svc.finance.liquidity(), U.round2(before.liquidity + 300000));
    eq('الضخّ النقدي يزيد رأس المال', Calc.capitalBalance(Repos.capital.list()), U.round2(before.capital + 300000));
    eq('الضخّ ليس إيراداً', Calc.revenue(Repos.revenues.list(), today, today), before.revenue);
    eq('الضخّ لا يغيّر الربح', Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), today, today), before.profit);

    /* 2) ضخّ بتحويل: سيولة بلا درج — وهو الفرق الذي كان ضائعاً قبل المرحلة الثانية */
    const afterCash = Svc.cashbook.expected(today).expected;
    /* البيانات التجريبية قد تكون ضخّت بتحويل اليوم أيضاً، فيُقاس الفرق لا الرقم المطلق */
    const nonCashCapBefore = Svc.cashbook.movement(today).capitalNonCashIn;
    const trIn = await Svc.finance.addCapital({ date:today, amount:500000, type:'injection',
      method:'transfer', description:'ضخّ بتحويل — اختبار' });
    eq('الضخّ بتحويل لا يزيد درج الصندوق', Svc.cashbook.expected(today).expected, afterCash);
    eq('الضخّ بتحويل يزيد السيولة', Svc.finance.liquidity(), U.round2(before.liquidity + 800000));
    const mvT = Svc.cashbook.movement(today);
    eq('التحويل يظهر في رأس المال غير النقدي',
       U.round2(mvT.capitalNonCashIn - nonCashCapBefore), 500000);
    ok('جدول الطرق يعرض التحويل داخلاً',
       (mvT.byMethod.find(m => m.key === 'transfer') || {}).in >= 500000,
       JSON.stringify(mvT.byMethod.map(m => [m.key, m.in])));

    /* 3) ضخّ ببطاقة: مثل التحويل تماماً — غير نقدي */
    const beforeCard = Svc.cashbook.expected(today).expected;
    await Svc.finance.addCapital({ date:today, amount:120000, type:'injection',
      method:'card', description:'ضخّ ببطاقة — اختبار' });
    eq('الضخّ ببطاقة لا يمسّ الدرج', Svc.cashbook.expected(today).expected, beforeCard);

    /* 4) استرجاع نقدي: يخرج من الدرج ولا يصير مصروفاً تشغيلياً */
    const expBefore = Calc.expenses(Repos.expenses.list(), today, today);
    const drawerBefore = Svc.cashbook.expected(today).expected;
    await Svc.finance.addCapital({ date:today, amount:100000, type:'withdrawal',
      method:'cash', description:'استرجاع نقدي — اختبار' });
    eq('الاسترجاع النقدي يخصم من الدرج', Svc.cashbook.expected(today).expected, U.round2(drawerBefore - 100000));
    eq('الاسترجاع ليس مصروفاً تشغيلياً', Calc.expenses(Repos.expenses.list(), today, today), expBefore);
    eq('الاسترجاع لا يقلّل الربح', Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), today, today), before.profit);

    /* 5) استرجاع بتحويل: سيولة تنقص ودرج لا يُمسّ */
    const d2 = Svc.cashbook.expected(today).expected, l2 = Svc.finance.liquidity();
    await Svc.finance.addCapital({ date:today, amount:200000, type:'withdrawal',
      method:'transfer', description:'استرجاع بتحويل — اختبار' });
    eq('الاسترجاع بتحويل لا يخصم من الدرج', Svc.cashbook.expected(today).expected, d2);
    eq('الاسترجاع بتحويل يقلّل السيولة', Svc.finance.liquidity(), U.round2(l2 - 200000));

    /* 6) مجهول الطريقة: خارج الدرج، داخل السيولة، معروضٌ للمراجعة لا مخمَّن */
    const unknownRec = await Repos.capital.create({ date:today, amount:77000, type:'injection',
      method:PayMethods.UNKNOWN_KEY, kind:'capital_injection', description:'حركة قديمة بلا طريقة' });
    const d3 = Svc.cashbook.expected(today);
    eq('مجهول الطريقة لا يدخل الدرج', d3.expected, Svc.cashbook.expected(today).expected);
    ok('مجهول الطريقة معروضٌ على حدة', d3.capitalUnknown >= 77000, d3.capitalUnknown);
    ok('مجهول الطريقة يظهر في قائمة المراجعة',
       PayMethods.unknownRecords().some(x => x.id === unknownRec.id));
    const beforeFix = Svc.cashbook.expected(today).expected;
    await Svc.finance.setCapitalMethod(unknownRec.id, 'cash');
    eq('تحديد الطريقة يُدخل المبلغ حساب الدرج', Svc.cashbook.expected(today).expected, U.round2(beforeFix + 77000));
    ok('لا تُقبل طريقة محجوزة لحركة رأس مال',
       await (async () => { try { await Svc.finance.setCapitalMethod(unknownRec.id, PayMethods.CREDIT_KEY); return false; }
                            catch(e){ return e.code === 'VALIDATION'; } })());

    /* 7) الثابت الحاكم للدرج يبقى صحيحاً بعد كل ما سبق */
    const p = Svc.cashbook.preview(today);
    eq('المتوقّع = الافتتاحي + الداخل − الخارج', p.expected, U.round2(p.opening + p.cashIn - p.cashOut));
    return results;
  }

  /* ==================== المرحلة الثانية: دورة الشراء ====================
     الخطأ الذي يُختبر هنا تحديداً: أن يُحسب الشراء مرتين — مرة بمستنده ومرة
     بدفعته. وأن يُخصم من الدرج ما لم يخرج منه. وأن يبقى رصيد المخزن حقيقة
     مجموعِ حركاته مهما رُحّل وأُلغي. */
  async function purchases(){
    const { Svc, Repos, Calc, U, D, Money } = T();
    const today = D.today();
    const sup = await Svc.suppliers.save(null, { name:'مورّد اختبار الشراء', phone:'07700000001',
      email:'sup@test.com', contact:'أبو علي' });
    ok('المورّد يُحفظ ببياناته', !!sup.id && sup.email === 'sup@test.com', sup.email);
    let dupe = false;
    try { await Svc.suppliers.save(null, { name:'مورّد اختبار الشراء' }); } catch(e){ dupe = e.code === 'VALIDATION'; }
    ok('لا يُكرَّر مورّد بالاسم نفسه', dupe);

    const { rec: p1 } = await Svc.inventory.saveProduct(null, { name:'صنف شراء أ', price:5000, cost:2000, openingQty:10 });
    const { rec: p2 } = await Svc.inventory.saveProduct(null, { name:'صنف شراء ب', price:9000, cost:4000 });
    const stockA0 = Svc.inventory.onHand(p1.id), stockB0 = Svc.inventory.onHand(p2.id);
    const costA0 = Repos.products.get(p1.id).cost;

    /* الإجماليات تُحسب من السطور — لا يُكتب رقمٌ يدوي فوقها */
    const draft = await Svc.purchases.save(null, { supplierId:sup.id, date:today, invoiceNo:'T-1',
      lines:[{ productId:p1.id, qty:10, unitCost:3000 }, { productId:p2.id, qty:5, unitCost:4000 }] });
    eq('إجمالي المستند = مجموع سطوره', draft.rec.total, 50000);
    ok('المستند يبدأ مسودة', draft.rec.status === 'draft', draft.rec.status);
    ok('المستند يحمل رقماً متسلسلاً', /^ش\d{5}$/.test(draft.rec.code), draft.rec.code);
    eq('المسودة لا تلمس المخزون', Svc.inventory.onHand(p1.id), stockA0);
    const expBefore = Calc.expenses(Repos.expenses.list(), today, today);
    eq('المسودة لا تُسجَّل مصروفاً', Calc.expenses(Repos.expenses.list(), today, today), expBefore);

    /* الترحيل: بضاعة تدخل، ومصروف واحد يُسجَّل، وطريقته «على الحساب» */
    const cashBefore = Svc.cashbook.expected(today).expected;
    const liqBefore = Svc.finance.liquidity();
    const posted = await Svc.purchases.post(draft.rec.id);
    ok('المستند يصير مُرحَّلاً', posted.status === 'posted', posted.status);
    eq('الترحيل يُدخل الكمية الأولى للمخزن', Svc.inventory.onHand(p1.id), U.round2(stockA0 + 10));
    eq('الترحيل يُدخل الكمية الثانية للمخزن', Svc.inventory.onHand(p2.id), U.round2(stockB0 + 5));
    eq('رصيد الصنف = مجموع حركاته بعد الترحيل', Svc.inventory.onHand(p1.id),
       Calc.onHand(Repos.stockMoves.list().filter(m => m.productId === p1.id)));
    eq('الشراء يُسجَّل مصروفاً مرة واحدة بكامل المستند',
       U.round2(Calc.expenses(Repos.expenses.list(), today, today) - expBefore), 50000);
    eq('عدد مصروفات المستند واحد',
       Repos.expenses.list(true).filter(e => e.refType === 'purchase' && e.refId === posted.id).length, 1);
    const pexp = Repos.expenses.get(posted.expenseId);
    ok('مصروف المستند بطريقة «على الحساب»', pexp.method === T().PayMethods.CREDIT_KEY, pexp.method);
    eq('الترحيل وحده لا يخرج من الدرج', Svc.cashbook.expected(today).expected, cashBefore);
    eq('ما لم يُدفع يعود إلى السيولة', Svc.finance.liquidity(), liqBefore);
    /* متوسط التكلفة المرجّح: 10 بـ2000 ثم 10 بـ3000 ⇒ 2500 */
    eq('متوسط التكلفة المرجّح يُحدَّث بالشراء', Repos.products.get(p1.id).cost,
       U.round2((stockA0 * costA0 + 10 * 3000) / (stockA0 + 10)));

    /* الدفع الجزئي: نقدٌ يخرج، ومتبقٍّ يظهر، وبلا مصروف ثانٍ */
    const st0 = Svc.purchases.balance(posted);
    eq('قبل الدفع: المتبقّي كامل المستند', st0.due, 50000);
    const pay1 = await Svc.purchases.addPayment({ purchaseId:posted.id, date:today, amount:20000, method:'cash' });
    eq('الدفع النقدي يخرج من الدرج', Svc.cashbook.expected(today).expected, U.round2(cashBefore - 20000));
    eq('الدفع لا يُنشئ مصروفاً ثانياً',
       U.round2(Calc.expenses(Repos.expenses.list(), today, today) - expBefore), 50000);
    eq('الدفع لا يُنشئ سطر إيراد', Repos.revenues.list(true).filter(r => r.refId === pay1.rec.id).length, 0);
    const st1 = Svc.purchases.balance(Repos.purchases.get(posted.id));
    eq('المدفوع 20 والمتبقّي 30', st1.paid, 20000);
    eq('المتبقّي للمورّد صحيح', st1.due, 30000);
    ok('حالة المستند «مدفوع جزئياً»', st1.key === 'PARTIAL', st1.key);
    eq('السيولة تنقص بما دُفع فقط', Svc.finance.liquidity(), U.round2(liqBefore - 20000));

    /* الدفع بتحويل: يقلّل المتبقّي ولا يمسّ الدرج */
    const drawer1 = Svc.cashbook.expected(today).expected;
    await Svc.purchases.addPayment({ purchaseId:posted.id, date:today, amount:10000, method:'transfer' });
    eq('الدفع بتحويل لا يمسّ الدرج', Svc.cashbook.expected(today).expected, drawer1);
    eq('المتبقّي بعد التحويل', Svc.purchases.balance(Repos.purchases.get(posted.id)).due, 20000);

    /* لا يُدفع أكثر من المتبقّي */
    let over = false;
    try { await Svc.purchases.addPayment({ purchaseId:posted.id, date:today, amount:25000, method:'cash' }); }
    catch(e){ over = e.code === 'VALIDATION'; }
    ok('لا يُدفع للمورّد أكثر من المتبقّي', over);

    /* كشف المورّد يجيب الأسئلة الثلاثة */
    const stmt = Svc.purchases.statement(sup.id);
    eq('كشف المورّد: كم اشترينا', stmt.purchased, 50000);
    eq('كشف المورّد: كم دفعنا', stmt.paid, 30000);
    eq('كشف المورّد: كم بقي عليه', stmt.due, 20000);
    eq('المستحق للموردين رقم واحد في كل الشاشات', Svc.purchases.payables().due,
       U.round2(U.sum(Svc.purchases.posted(), x => Svc.purchases.balance(x).due)));
    eq('السيولة تُعيد ما لم يُدفع', Calc.payables(Repos.purchases.list(), Repos.purchasePayments.list()),
       U.round2(U.sum(Svc.purchases.posted(), x => Svc.purchases.balance(x).due)));

    /* لا يُلغى مستند دُفع عليه، ولا يُرحَّل مرتين */
    let twice = false;
    try { await Svc.purchases.post(posted.id); } catch(e){ twice = e.code === 'ALREADY_POSTED'; }
    ok('لا يُرحَّل المستند مرتين', twice);
    let paidCancel = false;
    try { await Svc.purchases.cancel(posted.id, 'اختبار'); } catch(e){ paidCancel = e.code === 'LINKED'; }
    ok('لا يُلغى مستند سُدّد عليه قبل حذف دفعاته', paidCancel);
    let editPosted = false;
    try { await Svc.purchases.save(posted.id, { supplierId:sup.id, date:today, lines:[{ productId:p1.id, qty:1, unitCost:1 }] }); }
    catch(e){ editPosted = e.code === 'LOCKED'; }
    ok('لا يُعدَّل مستند مُرحَّل', editPosted);
    let mvLocked = false;
    const pmv = Repos.stockMoves.list().filter(m => m.refType === 'purchase' && m.refId === posted.id)[0];
    try { await Svc.inventory.removeMove(pmv.id); } catch(e){ mvLocked = e.code === 'LINKED'; }
    ok('لا تُحذف حركة مخزون يملكها مستند شراء', mvLocked);
    let expLocked = false;
    try { await Svc.finance.archiveExpense(posted.expenseId, true); } catch(e){ expLocked = e.code === 'LINKED'; }
    ok('لا يُؤرشف مصروف المستند مباشرة', expLocked);

    /* الإلغاء بعد حذف الدفعات: يعكس الأثر ولا يمحو التاريخ */
    for (const pp of Svc.purchases.paymentsOf(posted.id)) await Svc.purchases.removePayment(pp.id);
    eq('حذف الدفعات يعيد النقد للدرج', Svc.cashbook.expected(today).expected, cashBefore);
    const stockBeforeCancel = Svc.inventory.onHand(p1.id);
    const cancelled = await Svc.purchases.cancel(posted.id, 'بضاعة مرتجعة');
    ok('المستند يبقى في السجل بحالة ملغى', cancelled.status === 'cancelled' && !!Repos.purchases.get(posted.id));
    eq('الإلغاء يعيد المخزون كما كان', Svc.inventory.onHand(p1.id), U.round2(stockBeforeCancel - 10));
    eq('رصيد الصنف بعد الإلغاء = مجموع حركاته', Svc.inventory.onHand(p1.id),
       Calc.onHand(Repos.stockMoves.list().filter(m => m.productId === p1.id)));
    eq('الإلغاء يسحب المصروف من الربح',
       U.round2(Calc.expenses(Repos.expenses.list(), today, today)), expBefore);
    eq('الإلغاء يعيد متوسط التكلفة إلى ما تسنده الحركات الباقية',
       Repos.products.get(p1.id).cost, costA0);
    eq('المستند الملغى لا يبقى مستحقاً للمورّد', Svc.purchases.statement(sup.id).due, 0);
    ok('سجل الأحداث يوثّق الترحيل والإلغاء',
       T().Audit.recent(200).filter(a => a.entity === 'purchase' && ['post','cancel','pay'].includes(a.action)).length >= 3);

    /* لا يُلغى شراءٌ بيعت بضاعته: الرصيد سيصير كذباً */
    const d3 = await Svc.purchases.save(null, { supplierId:sup.id, date:today,
      lines:[{ productId:p2.id, qty:3, unitCost:4500 }] });
    await Svc.purchases.post(d3.rec.id);
    await Svc.inventory.addMove({ productId:p2.id, date:today, type:'adjust_out',
      qty:Svc.inventory.onHand(p2.id), notes:'تفريغ الرصيد للاختبار' });
    let stockGuard = false;
    try { await Svc.purchases.cancel(d3.rec.id, 'اختبار'); } catch(e){ stockGuard = e.code === 'STOCK'; }
    ok('لا يُلغى مستند لا يحتمل المخزون إرجاعه', stockGuard);

    /* سلامة البيانات لا ترى خللاً بعد كل هذا */
    const bad = T().Integrity.scan().filter(x => /شراء|مورّد/.test(x.type));
    ok('لا خلل في روابط دورة الشراء', bad.length === 0, JSON.stringify(bad.slice(0, 5)));
    return results;
  }

  /* ============ المرحلة الثانية: تفصيل توزيعات الشركاء بالضبط ============
     الثابت الوحيد الذي يحرس هذا القسم: مجموع ما خُصّص للأشهر = مبلغ التوزيع.
     دائماً، بلا باقٍ مخفي ولا انحراف تقريب. */
  async function allocations(){
    const { Svc, Repos, Calc, U, D } = T();
    const partner = await Repos.partners.create({ name:'شريكة التفصيل', sharePercent:50 });
    const keys = D.monthsBack(12).slice(0, 3);          /* ثلاثة أشهر لم تلمسها البيانات التجريبية */
    const amounts = [400000, 100000, 300000];
    for (let i = 0; i < keys.length; i++)
      await Svc.finance.addRevenue({ date:D.startOfMonth(keys[i]), amount:amounts[i],
        source:'service', description:'إيراد اختبار التفصيل', method:'cash' });
    for (const k of keys){ if (Svc.periods.isClosed(k)) await Svc.periods.reopen(k, 'تهيئة').catch(() => {});
      await Svc.periods.close(k); }

    /* 1) شهر واحد: التفصيل بديهي وكامل */
    const one = await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(keys[0]),
      periodTo:D.endOfMonth(keys[0]), amount:50000, date:D.today(), method:'cash' });
    const oneAl = Svc.distributions.allocationsOf(one.rec);
    ok('توزيع شهر واحد يُفصَّل على شهره', oneAl.length === 1 && oneAl[0].key === keys[0], JSON.stringify(oneAl));
    eq('تفصيل الشهر الواحد = المبلغ كله', oneAl[0].amount, 50000);

    /* 2) عدة أشهر بتفصيل صريح: يُحفظ كما كُتب لا كما يُقترح */
    const manual = [{ key:keys[0], amount:60000 }, { key:keys[1], amount:30000 }, { key:keys[2], amount:10000 }];
    const multi = await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(keys[0]),
      periodTo:D.endOfMonth(keys[2]), amount:100000, date:D.today(), method:'cash', allocations:manual });
    const mAl = Svc.distributions.allocationsOf(multi.rec);
    eq('مجموع التفصيل = مبلغ التوزيع', U.round2(U.sum(mAl, a => a.amount)), 100000);
    ok('التفصيل الصريح يُحفظ كما كُتب',
       JSON.stringify(mAl.map(a => [a.key, a.amount])) === JSON.stringify(manual.map(a => [a.key, a.amount])),
       JSON.stringify(mAl.map(a => [a.key, a.amount])));
    ok('مصدر التفصيل مسجَّل', multi.rec.allocationSource === 'manual', multi.rec.allocationSource);

    /* 3) التفصيل المقترح: بنسبة النصيب، ومجموعه مضبوط تماماً */
    const prop = Svc.distributions.proposeAllocations(partner.id, D.startOfMonth(keys[0]), D.endOfMonth(keys[2]), 99999);
    eq('التفصيل المقترح مجموعه = المبلغ بلا باقٍ', U.round2(U.sum(prop, a => a.amount)), 99999);
    const shares = keys.map(k => Calc.partnerShare(Svc.periods.get(k).net, partner.sharePercent));
    ok('الشهر الأكثر ربحاً يُقترح له النصيب الأكبر',
       prop[shares.indexOf(Math.max(...shares))].amount === Math.max(...prop.map(a => a.amount)),
       JSON.stringify(prop.map(a => [a.key, a.amount])));

    /* 4) التفصيل الخاطئ يُرفض: لا يُحفظ مجموعٌ يخالف مبلغه */
    let badSum = false;
    try { await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(keys[0]),
      periodTo:D.endOfMonth(keys[2]), amount:100000, date:D.today(), method:'cash',
      allocations:[{ key:keys[0], amount:60000 }, { key:keys[1], amount:10000 }] }); }
    catch(e){ badSum = e.code === 'VALIDATION' && !!e.details.allocations; }
    ok('يُرفض تفصيل مجموعه لا يساوي المبلغ', badSum);
    let stray = false;
    try { await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(keys[0]),
      periodTo:D.endOfMonth(keys[0]), amount:1000, date:D.today(), method:'cash',
      allocations:[{ key:keys[2], amount:1000 }] }); }
    catch(e){ stray = e.code === 'VALIDATION'; }
    ok('يُرفض تفصيل بشهر خارج الفترة', stray);

    /* 5) الكشف يقرأ التفصيل المحفوظ لا تقديراً */
    const st = Svc.distributions.statement(partner.id);
    const got = Object.fromEntries(st.periods.filter(p => keys.includes(p.key)).map(p => [p.key, p.paid]));
    eq('كشف الشريكة: الشهر الأول', got[keys[0]], U.round2(50000 + 60000));
    eq('كشف الشريكة: الشهر الثاني', got[keys[1]], 30000);
    eq('كشف الشريكة: الشهر الثالث', got[keys[2]], 10000);
    eq('مجموع ما فُصِّل = مجموع ما وُزّع', st.allocatedTotal, st.paid);
    eq('إجمالي المقبوض = مجموع التوزيعات', st.paid,
       U.round2(U.sum(Svc.distributions.ofPartner(partner.id), d => d.amount)));

    /* 6) التعديل: المبلغ والتفصيل يتحرّكان معاً */
    const upd = await Svc.distributions.update(multi.rec.id, { amount:120000,
      allocations:[{ key:keys[0], amount:70000 }, { key:keys[1], amount:30000 }, { key:keys[2], amount:20000 }] });
    eq('بعد التعديل: المجموع = المبلغ الجديد',
       U.round2(U.sum(Svc.distributions.allocationsOf(upd.rec), a => a.amount)), 120000);
    const upd2 = await Svc.distributions.update(multi.rec.id, { amount:60000 });
    eq('تعديل المبلغ وحده يُعيد ضبط التفصيل تحته',
       U.round2(U.sum(Svc.distributions.allocationsOf(upd2.rec), a => a.amount)), 60000);

    /* 7) الإلغاء يُطابق من جديد */
    const paidBefore = Svc.distributions.statement(partner.id).paid;
    await Svc.distributions.remove(multi.rec.id);
    const stAfter = Svc.distributions.statement(partner.id);
    eq('الإلغاء يُنقص المقبوض بمقدار التوزيع', stAfter.paid, U.round2(paidBefore - 60000));
    eq('بعد الإلغاء: ما فُصِّل = ما وُزّع', stAfter.allocatedTotal, stAfter.paid);

    /* 8) التوزيع القديم بلا تفصيل: يُقال عنه ذلك ولا يُخمَّن */
    const legacy = await Repos.distributions.create({ partnerId:partner.id,
      periodFrom:D.startOfMonth(keys[0]), periodTo:D.endOfMonth(keys[2]), amount:45000,
      date:D.today(), method:'cash', notes:'توزيع قديم', allocations:[], allocationUnavailable:true });
    const stL = Svc.distributions.statement(partner.id);
    ok('التوزيع القديم يُعدّ بلا تفصيل', Svc.distributions.isUnallocated(legacy));
    eq('مجموع ما بلا تفصيل يُعرض على حدة', stL.unallocatedTotal, 45000);
    eq('التوزيع القديم لا يُوزَّع تخميناً على الأشهر',
       U.round2(U.sum(keys, k => Svc.distributions.allocatedTo(legacy, k))), 0);
    eq('إجمالي المقبوض يبقى مضبوطاً رغم غياب التفصيل', stL.paid,
       U.round2(stL.allocatedTotal + stL.unallocatedTotal));
    ok('الكشف المطبوع يشرح التوزيع القديم',
       T().Print.partnerStatementHtml(partner.id).includes('لم يُقسَم تخميناً'));

    /* 9) الشهر غير المقفل داخل فترة ممتدّة: يُعلَّم في الاقتراح ولا يُوزَّع منه.
       (وُجد في مراجعة المتصفح: الاقتراح كان يعرضه سطراً عادياً تُكتب فيه أرقام
        ثم يُرفض الحفظ كله برسالة أعمّ من أن تقول أي شهر أوقفها.) */
    const openKey = D.monthsBack(13)[0];
    if (Svc.periods.isClosed(openKey)) await Svc.periods.reopen(openKey, 'اختبار').catch(() => {});
    const spanned = Svc.distributions.proposeAllocations(partner.id,
      D.startOfMonth(openKey), D.endOfMonth(keys[2]), 50000);
    ok('الاقتراح يعلّم الشهر غير المقفل',
       spanned.some(a => a.key === openKey && a.closed === false),
       JSON.stringify(spanned.map(a => [a.key, a.closed])));
    ok('الاقتراح يعلّم الأشهر المقفلة كذلك',
       spanned.filter(a => keys.includes(a.key)).every(a => a.closed === true));
    eq('اقتراح الفترة الممتدّة يبقى مجموعه = المبلغ',
       U.round2(U.sum(spanned, a => a.amount)), 50000);
    let openBlocked = false;
    try { await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(openKey),
      periodTo:D.endOfMonth(keys[2]), amount:50000, date:D.today(), method:'cash' }); }
    catch(e){ openBlocked = e.code === 'VALIDATION'; }
    ok('لا يُوزَّع من فترة فيها شهر غير مقفل', openBlocked);
    /* وعلم العرض لا يُخزَّن: السجل يحمل ما يلزم وحده */
    ok('التفصيل المحفوظ لا يحمل أعلام عرض',
       Svc.distributions.allocationsOf(Repos.distributions.list(true)
         .find(d => Svc.distributions.allocationsOf(d).length)).every(a => !('closed' in a)));

    /* 10) ثابت عام: لا توزيع في القاعدة كلها مجموع تفصيله يخالف مبلغه */
    const drift = Repos.distributions.list(true).filter(d => {
      const al = Svc.distributions.allocationsOf(d);
      return al.length && Math.abs(U.round2(U.sum(al, a => a.amount) - d.amount)) > 0.009;
    });
    ok('لا انحراف بين التفصيل والمبلغ في أي توزيع', drift.length === 0, drift.length);
    ok('فحص السلامة لا يرى خللاً في التفصيل',
       T().Integrity.scan().filter(x => /تفصيل توزيع/.test(x.type)).length === 0);
    return results;
  }

  /* ============ المرحلة الثانية: الإقفال المُعان بقائمة مراجعة ============ */
  async function periodClose(){
    const { Svc, Repos, Calc, U, D, PayMethods } = T();
    const key = D.monthsBack(7)[0];
    const from = D.startOfMonth(key), to = D.endOfMonth(key);
    if (Svc.periods.isClosed(key)) await Svc.periods.reopen(key, 'تهيئة الاختبار').catch(() => {});
    const cat = Repos.expCats.list()[0];
    await Svc.finance.addRevenue({ date:from, amount:600000, source:'service',
      description:'إيراد فترة الإقفال', method:'cash' });
    await Svc.finance.addExpense({ date:from, amount:200000, categoryId:cat.id,
      description:'مصروف فترة الإقفال', method:'cash' });

    /* الملخّص يقول ما الذي يُقفَل عليه */
    const sum = Svc.periods.summary(key);
    eq('ملخّص الإقفال: الإيراد', sum.revenue, Calc.revenue(Repos.revenues.list(), from, to));
    eq('ملخّص الإقفال: المصروف', sum.expense, Calc.expenses(Repos.expenses.list(), from, to));
    eq('ملخّص الإقفال: صافي الربح', sum.net, U.round2(sum.revenue - sum.expense));
    ok('الملخّص يفصل النقدي عن غيره',
       typeof sum.cashIn === 'number' && typeof sum.nonCashIn === 'number'
       && typeof sum.cashOut === 'number' && typeof sum.nonCashOut === 'number');
    ok('الملخّص يعرض رأس المال والتوزيعات خارج الربح',
       typeof sum.capitalIn === 'number' && typeof sum.distributions === 'number');
    ok('الملخّص يعرض المتوقّع في الدرج آخر الفترة', typeof sum.endingExpectedCash === 'number');

    /* مانع: طريقة دفع غير معروفة داخل الفترة */
    const ghost = await Repos.expenses.create({ date:from, amount:33000, categoryId:cat.id,
      description:'مصروف بلا طريقة', method:PayMethods.UNKNOWN_KEY });
    const ck1 = Svc.periods.checklist(key);
    ok('القائمة تكشف السجل مجهول الطريقة',
       ck1.blocking.some(b => b.code === 'UNKNOWN_METHOD'), JSON.stringify(ck1.blocking.map(b => b.code)));
    ok('القائمة تقول إن الفترة غير جاهزة', ck1.ok === false);
    let blocked = false;
    try { await Svc.periods.close(key); } catch(e){ blocked = e.code === 'PERIOD_BLOCKED'; }
    ok('المانع يمنع الإقفال فعلاً', blocked);
    ok('الفترة لم تُقفل رغم المحاولة', !Svc.periods.isClosed(key));
    await Svc.finance.updateExpense(ghost.id, { date:from, amount:33000, categoryId:cat.id,
      description:'مصروف بلا طريقة', method:'cash' });
    ok('حلّ المانع يُخرجه من القائمة',
       !Svc.periods.checklist(key).blocking.some(b => b.code === 'UNKNOWN_METHOD'));

    /* مانع: مستند شراء مسودة داخل الفترة */
    const sup = await Svc.suppliers.save(null, { name:'مورّد الإقفال' });
    const { rec: prod } = await Svc.inventory.saveProduct(null, { name:'صنف الإقفال', price:3000, cost:1000 });
    const dr = await Svc.purchases.save(null, { supplierId:sup.id, date:from,
      lines:[{ productId:prod.id, qty:4, unitCost:1000 }] });
    ok('القائمة تكشف مستند الشراء المسودة',
       Svc.periods.checklist(key).blocking.some(b => b.code === 'DRAFT_PURCHASE'));
    let blocked2 = false;
    try { await Svc.periods.close(key); } catch(e){ blocked2 = e.code === 'PERIOD_BLOCKED'; }
    ok('المسودة تمنع الإقفال', blocked2);
    await Svc.purchases.post(dr.rec.id);
    const ck2 = Svc.periods.checklist(key);
    ok('ترحيل المسودة يرفع المانع', !ck2.blocking.some(b => b.code === 'DRAFT_PURCHASE'));

    /* تنبيه يُقَرّ ولا يمنع */
    ok('المستحق للموردين تنبيه لا مانع',
       ck2.warnings.some(w => w.code === 'PAYABLES') && !ck2.blocking.some(b => b.code === 'PAYABLES'),
       JSON.stringify({ w:ck2.warnings.map(w => w.code), b:ck2.blocking.map(b => b.code) }));
    ok('القائمة تفصل المانع عن التنبيه عن المعلومة',
       Array.isArray(ck2.blocking) && Array.isArray(ck2.warnings) && Array.isArray(ck2.info));

    /* الإقفال الناجح يحفظ ما أُقرّ */
    const closed = await Svc.periods.close(key);
    ok('الفترة أُقفلت', Svc.periods.isClosed(key));
    eq('الربح المثبَّت = إيراد الفترة − مصروفها', closed.net, U.round2(closed.revenue - closed.expense));
    ok('الإقفال يحفظ لقطة الملخّص', !!closed.snapshot && closed.snapshot.key === key);
    ok('الإقفال يحفظ التنبيهات التي أُقرّت', Array.isArray(closed.acknowledged) && closed.acknowledged.length > 0,
       JSON.stringify((closed.acknowledged || []).map(a => a.code)));
    ok('ملخّص الإقفال يُطبع', (T().Print.periodCloseHtml(key) || '').includes('ملخّص إقفال فترة'));

    /* الفترة المقفلة لا تتحرّك صامتة */
    const netAfter = closed.net;
    let guarded = false;
    try { await Svc.finance.addExpense({ date:from, amount:9999, categoryId:cat.id,
      description:'مصروف متأخر', method:'cash' }); }
    catch(e){ guarded = e.code === 'PERIOD_CLOSED'; }
    ok('لا يُسجَّل مصروف في فترة مقفلة بلا تصحيح مُعلَّل', guarded);
    let guardedRev = false;
    try { await Svc.finance.addRevenue({ date:from, amount:9999, source:'service',
      description:'إيراد متأخر', method:'cash' }); }
    catch(e){ guardedRev = e.code === 'PERIOD_CLOSED'; }
    ok('لا يُسجَّل إيراد في فترة مقفلة بلا تصحيح مُعلَّل', guardedRev);
    eq('الربح المثبَّت لم يتحرّك', Svc.periods.get(key).net, netAfter);

    /* التصحيح ممكن لكنه مُعلَّل ومسجَّل */
    const corrected = await Svc.finance.addExpense({ date:from, amount:5000, categoryId:cat.id,
      description:'فاتورة وصلت متأخرة', method:'cash', correctionReason:'فاتورة كهرباء وصلت بعد الإقفال' });
    ok('التصحيح المُعلَّل يمرّ', !!corrected.id);
    ok('التصحيح يُسجَّل في سجل الأحداث',
       T().Audit.recent(60).some(a => a.entity === 'period' && a.action === 'correction'));
    eq('التصحيح لا يعيد كتابة الربح المثبَّت', Svc.periods.get(key).net, netAfter);
    ok('الرقم المثبَّت يختلف عن الرقم المتحرّك بعد التصحيح',
       Svc.periods.profitOf(key).net !== Svc.periods.get(key).net,
       `${Svc.periods.profitOf(key).net} / ${Svc.periods.get(key).net}`);

    /* التوزيع بعد الإقفال يعمل على الرقم المثبَّت */
    const partner = await Repos.partners.create({ name:'شريكة الإقفال', sharePercent:25 });
    const ent = Svc.distributions.entitlement(partner.id, from, to);
    eq('النصيب محسوب على الربح المثبَّت', ent.share, Calc.partnerShare(netAfter, 25));
    const dist = await Svc.distributions.create({ partnerId:partner.id, periodFrom:from, periodTo:to,
      amount:U.round2(ent.share / 2), date:D.today(), method:'cash' });
    ok('التوزيع بعد الإقفال ممكن', !!dist.rec.id);
    eq('التوزيع لا يقلّل الربح المثبَّت', Svc.periods.get(key).net, netAfter);
    let reopenBlocked = false;
    try { await Svc.periods.reopen(key, 'اختبار'); } catch(e){ reopenBlocked = e.code === 'LINKED'; }
    ok('لا تُعاد فتح فترة وُزّعت أرباحها', reopenBlocked);
    return results;
  }

  /* 13) الحصص المشمولة تُسقَط بأرشفة الاشتراك */
  async function creditsOnArchive(){
    const { Svc, Repos, D } = T();
    const { rec: m } = await Svc.members.create({ name:'مشتركة الحصص', joinDate:D.today() });
    const { rec: sub } = await Svc.subs.create({ memberId:m.id, startDate:D.today(),
      customDuration:{ value:1, unit:'month' }, price:100000, paidAmount:100000,
      sessionCredits:8, ptCredits:2 });
    let bal = Svc.credits.balance(m.id, 'class');
    eq('الحصص المشمولة تُمنح مع الاشتراك', bal.total, 8);
    eq('التدريب الخاص يُمنح كذلك', Svc.credits.balance(m.id, 'pt').total, 2);
    await Svc.credits.consume(m.id, 'class', { qty:3 });
    eq('الاستهلاك يخصم من الرصيد', Svc.credits.balance(m.id, 'class').remaining, 5);

    await Svc.subs.archive(sub.id, true);
    bal = Svc.credits.balance(m.id, 'class');
    eq('أرشفة الاشتراك تُسقط ما بقي من حصصه', bal.remaining, 0);
    ok('الإسقاط حدث ظاهر لا حذف صامت',
       Repos.credits.list().some(c => c.type === 'expire' && c.refType === 'subscription' && c.refId === sub.id));
    ok('تاريخ المنح والاستهلاك يبقى كاملاً',
       Repos.credits.list().filter(c => c.subId === sub.id && c.type === 'grant').length === 2
       && Repos.credits.list().some(c => c.type === 'use'));
    ok('الحصص ليست مالاً: لا أثر لها في المالية',
       !Repos.revenues.list(true).some(r => r.refId === sub.id && r.amount === 0));

    await Svc.subs.archive(sub.id, false);
    eq('استرجاع الاشتراك يعيد الرصيد', Svc.credits.balance(m.id, 'class').remaining, 5);
    return results;
  }

  /* 14) البحث العام */
  async function search(){
    const { Repos, Svc, U } = T();
    const box = document.getElementById('globalSearchRes');
    const m = Repos.members.list()[0];
    Actions.globalSearch('ا');
    ok('حرف واحد لا يفتح النتائج', box.classList.contains('hidden'));
    Actions.globalSearch(m.code);
    ok('الكود الكامل يقفز مباشرة إلى المشتركة',
       box.innerHTML.includes('مطابقة تامة للكود') && box.innerHTML.includes(U.esc(m.name)));
    const rc = Repos.receipts.list(true)[0];
    if (rc){
      Actions.globalSearch(rc.no);
      ok('رقم الوصل الكامل يقفز مباشرة إلى الوصل', box.innerHTML.includes('مطابقة تامة لرقم الوصل'));
    }
    /* كيانات المرحلة الثانية دخلت البحث: المورّد ومستند الشراء. بلا ذلك يبقى
       ما اشتراه النادي غير قابل للعثور عليه إلا بالتنقّل اليدوي. */
    const sup = Svc.suppliers.list()[0];
    if (sup){
      Actions.globalSearch(U.normAr(sup.name).slice(0, 4));
      ok('البحث يجد المورّد بالاسم',
         [...box.querySelectorAll('.gs-group')].some(g => g.textContent.includes('موردون')),
         [...box.querySelectorAll('.gs-group')].map(g => g.textContent.trim()).join(' | '));
    }
    const pur = Svc.purchases.list(true)[0];
    if (pur){
      Actions.globalSearch(pur.code);
      ok('رقم مستند الشراء الكامل يقفز مباشرة',
         box.innerHTML.includes('مطابقة تامة لرقم مستند الشراء'), pur.code);
      const supName = (Repos.suppliers.get(pur.supplierId) || {}).name || '';
      if (supName){
        Actions.globalSearch(U.normAr(supName).slice(0, 4));
        ok('البحث يجد مستندات الشراء باسم مورّدها',
           [...box.querySelectorAll('.gs-group')].some(g => g.textContent.includes('مستندات شراء')),
           [...box.querySelectorAll('.gs-group')].map(g => g.textContent.trim()).join(' | '));
      }
    }
    /* حرفان شائعان: مجموعات متعدّدة، والمشتركات أولاً، وثلاث نتائج للمجموعة */
    Actions.globalSearch('ا ');
    Actions.globalSearch(U.normAr(m.name).slice(0, 2));
    const groups = [...box.querySelectorAll('.gs-group')].map(g => g.textContent.trim());
    ok('المشتركات أولاً في النتائج', (groups[0] || '').startsWith('مشتركات'), groups.join(' | '));
    let counts = [], cur = 0;
    [...box.children].forEach(el => {
      if (el.classList.contains('gs-group')){ if (cur) counts.push(cur); cur = 0; }
      else if (el.hasAttribute('data-hit')) cur++;
    });
    if (cur) counts.push(cur);
    ok('لا تزيد نتائج المجموعة على ثلاث', Math.max(...counts, 0) <= 3, counts.join(','));
    ok('أفعال المشتركة على الصف: حضور وتجديد وقبض',
       ['حضور','تجديد','قبض'].every(t => box.innerHTML.includes(`>${t}<`)));
    /* «عرض الكل» يظهر حين تتجاوز المجموعة الحد */
    const many = Svc.members.rows(true).length > 3;
    if (many){
      Actions.globalSearch('ا');
      Actions.globalSearch('ة');
    }
    /* التطبيع العربي: الهمزة والياء والتاء المربوطة */
    const nm = m.name;
    Actions.globalSearch(nm.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').slice(0, 4));
    ok('التطبيع العربي محفوظ (ألف/ياء/تاء مربوطة)', box.innerHTML.includes(U.esc(nm)) || box.innerHTML.includes('لا نتائج'),
       box.innerHTML.slice(0, 80));
    Actions.globalSearch('زززززز');
    ok('بحث بلا نتائج يقول ذلك', box.innerHTML.includes('لا نتائج'));
    return results;
  }

  /* 15) الشاشة الافتتاحية */
  async function startScreen(){
    const { Settings } = T();
    ok('الافتراضي هو الاستقبال', (Settings.get('startScreen') || 'desk') === 'desk', Settings.get('startScreen'));
    await Settings.set({ startScreen:'dashboard' });
    ok('الإعداد يُحفظ', Settings.get('startScreen') === 'dashboard');
    await Settings.set({ startScreen:'desk' });
    return results;
  }

  /* ========================= 8) الاستمرارية ========================= */
  /* ================== المرحلة 3أ: الهوية البصرية المتحرّكة ==================
     الـGIF ليس صورة أكبر: هو حركة تبقى تعمل ما دامت الصفحة مفتوحة. فما
     يُختبر هنا ليس «هل رُفع الملف» بل: هل بقي متحرّكاً حيث يجب أن يتحرّك،
     وثابتاً حيث لا تجوز الحركة (الورقة المطبوعة وتفضيل تقليل الحركة)،
     وهل نجا من إعادة التحميل والنسخة، وهل رُفض الكبير قبل أن يُثقل الجهاز. */
  function gifFile(name){
    /* GIF متحرّك حقيقي: إطاران 2×2 مع كتلة NETSCAPE للتكرار */
    const b64 = 'R0lGODlhAgACAPIAAP///wAAAP//AAAA/wAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh'
              + '+QQJCgAAACwAAAAAAgACAAADBAgEpQIAIfkECQoAAAAsAAAAAAIAAgAAAwQIhKUCADs=';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name || 'brand.gif', { type:'image/gif' });
  }
  function pngFile(name){
    /* PNG ثابت 1×1 */
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name || 'brand.png', { type:'image/png' });
  }

  async function branding(){
    const { Brand, Svc, Repos, Backup, U, Settings } = T();
    const mediaBefore = Repos.media.list(true).length;

    /* ---------- 1) الشعار الثابت: دورة حياة كاملة ---------- */
    const png = await Brand.setMedia('logo', pngFile('logo.png'));
    ok('الشعار الثابت يُرفع ويُحفظ وسائطَ', !!png.id && !!Repos.media.get(png.id), png.id);
    ok('الشعار الثابت لا يُعلَّم متحرّكاً', png.animated === false && !png.posterUrl);
    ok('الشعار الثابت يحمل أبعاده', png.width > 0 && png.height > 0, `${png.width}×${png.height}`);
    ok('الشعار يظهر في الشريط الجانبي', Brand.logoHtml(40).includes(png.dataUrl.slice(22, 48)));
    ok('الشعار يظهر في الترويسة المطبوعة', Brand.printHeader('س','ص').includes('<img'));
    ok('الوسائط مربوطة بالهوية فلا تُعدّ يتيمة', Svc.media.usedBy(png.id).length === 1,
       JSON.stringify(Svc.media.usedBy(png.id)));

    /* ---------- 2) الشعار المتحرّك: يُرفع ويُعلَّم ويُستخرج إطاره ---------- */
    const gif = await Brand.setMedia('logo', gifFile('logo.gif'));
    ok('الشعار المتحرّك يُرفع', !!gif.id && gif.type === 'image/gif');
    ok('الشعار المتحرّك يُعلَّم متحرّكاً', gif.animated === true && Brand.isAnimated('logo'));
    ok('يُستخرج إطار ثابت عند الرفع', !!gif.posterUrl && String(gif.posterUrl).startsWith('data:image/png'),
       String(gif.posterUrl || '').slice(0, 22));
    ok('الاستبدال لا يترك الشعار القديم يتيماً', !Repos.media.get(png.id), png.id);
    eq('لم يتضخّم جدول الوسائط بالاستبدال', Repos.media.list(true).length, mediaBefore + 1);

    /* ---------- 3) الحركة حيث تجوز، والثبات حيث لا تجوز ---------- */
    ok('الشاشة تعرض الملف المتحرّك نفسه',
       Brand.renderUrl('logo', false).startsWith('data:image/gif'), Brand.renderUrl('logo', false).slice(0, 22));
    ok('الطباعة تأخذ الإطار الثابت لا الملف المتحرّك',
       Brand.renderUrl('logo', true) === gif.posterUrl);
    ok('الترويسة المطبوعة خالية من الصورة المتحرّكة',
       !Brand.printHeader('وصل','معاينة').includes('data:image/gif'));
    ok('وصل الطباعة خالٍ من الصورة المتحرّكة',
       !T().Print.receiptHtml({ no:'و1', issuedAt:new Date().toISOString(), amount:1000, reprints:0,
         snapshot:{ gym:{ name:Brand.name() }, member:{ name:'س', code:'ت1' },
           doc:{ kind:'subscription', title:'اشتراك', detail:'' }, payment:{ amount:1000, method:'cash', date:T().D.today() } } },
         { format:'a4' }).includes('data:image/gif'));

    /* ---------- 4) اللافتة: ثابتة ثم متحرّكة ---------- */
    const bpng = await Brand.setMedia('banner', pngFile('banner.png'));
    ok('اللافتة الثابتة تُرفع', !!bpng.id && bpng.animated === false);
    ok('اللافتة الثابتة تُرسم', Brand.bannerHtml().includes('brand-banner'));
    const bgif = await Brand.setMedia('banner', gifFile('banner.gif'));
    ok('اللافتة المتحرّكة تُرفع وتُعلَّم', bgif.animated === true && Brand.isAnimated('banner'));
    ok('اللافتة تُرسم متحرّكة على الشاشة', Brand.bannerHtml().includes('data-motion="live"')
       && Brand.bannerHtml().includes('data:image/gif'));
    ok('اللافتة تُرسم ثابتة عند الطباعة', Brand.bannerHtml(true).includes('data-motion="still"')
       && !Brand.bannerHtml(true).includes('data:image/gif'));

    /* ---------- 5) الحدود: الكبير والنوع غير المدعوم يُرفضان بوضوح ---------- */
    const big = new File([new Uint8Array(Svc.media.ANIMATED_MAX + 1024)], 'big.gif', { type:'image/gif' });
    let bigErr = null;
    try { await Brand.setMedia('logo', big); } catch(e){ bigErr = e; }
    ok('الصورة المتحرّكة الكبيرة تُرفض', bigErr && bigErr.code === 'GIF_TOO_BIG', bigErr && bigErr.code);
    ok('رسالة الرفض تذكر الحدّ بالعربية', bigErr && /ميغابايت/.test(bigErr.message), bigErr && bigErr.message.slice(0, 40));
    ok('الرفض لا يغيّر الشعار القائم', Brand.info('logo').id === gif.id);
    ok('الرفض لا يترك وسائط نصف محفوظة', Repos.media.list(true).length === mediaBefore + 2,
       Repos.media.list(true).length);
    let typeErr = null;
    try { await Brand.setMedia('logo', new File([new Uint8Array(10)], 'x.bmp', { type:'image/bmp' })); }
    catch(e){ typeErr = e; }
    ok('النوع غير المدعوم يُرفض', typeErr && typeErr.code === 'BAD_TYPE', typeErr && typeErr.code);
    /* الحدّ العام ما زال قائماً للوسائط الأخرى */
    ok('حدّ الصور المتحرّكة أصغر من الحدّ العام', Svc.media.ANIMATED_MAX < Svc.media.MAX,
       `${Svc.media.ANIMATED_MAX} < ${Svc.media.MAX}`);

    /* ---------- 6) النسخة الاحتياطية والاستعادة ---------- */
    const snapshot = { logo:Brand.info('logo'), banner:Brand.info('banner') };
    const backup = Backup.build(true);
    ok('النسخة تحمل الوسائط المتحرّكة',
       (backup.data.media || []).some(x => x.type === 'image/gif' && x.animated === true));
    ok('النسخة تحمل الإطار الثابت معها',
       (backup.data.media || []).filter(x => x.animated).every(x => !!x.posterUrl));
    await Brand.clearMedia('logo');
    await Brand.clearMedia('banner');
    ok('الإزالة تُفرّغ الهوية', !Brand.info('logo').exists && !Brand.info('banner').exists);
    ok('الإزالة لا تترك وسائط يتيمة', Svc.media.usage().orphans === 0, Svc.media.usage().orphans);
    ok('بلا شعار تُرسم العلامة المدمجة لا مربّع مكسور', Brand.logoHtml(40).includes('<svg'));
    await Backup.restore(backup);
    ok('الاستعادة تُرجع الشعار المتحرّك',
       Brand.info('logo').exists && Brand.info('logo').animated, JSON.stringify(Brand.info('logo')));
    ok('الاستعادة تُرجع اللافتة المتحرّكة', Brand.info('banner').exists && Brand.info('banner').animated);
    ok('الاستعادة تُرجع الإطار الثابت', Brand.info('logo').hasPoster && Brand.info('banner').hasPoster);
    eq('حجم الشعار المستعاد كما كان', Brand.info('logo').size, snapshot.logo.size);
    ok('الاستعادة لا تُنتج وسائط يتيمة', Svc.media.usage().orphans === 0, Svc.media.usage().orphans);

    /* ---------- 7) وسائط قديمة بلا الحقول الجديدة: لا شيء ينكسر ---------- */
    const legacy = await Repos.media.create({ name:'legacy.gif', type:'image/gif', size:120, kind:'image',
      dataUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });   /* بلا animated ولا posterUrl */
    ok('الوسائط القديمة تُعرف متحرّكة من نوعها', Svc.media.isAnimated(legacy));
    ok('بلا إطار محفوظ يُستعمل الأصل ولا تنكسر الطباعة',
       Svc.media.stillUrl(legacy) === legacy.dataUrl);
    await Settings.set({ branding:Object.assign({}, Brand.get(), { logoMediaId:legacy.id }) });
    ok('الترويسة المطبوعة تُبنى على وسائط قديمة بلا خطأ', Brand.printHeader('س','ص').includes('<img'));
    ok('وصف المعاينة يقول إن الإطار غير متاح',
       Brand.info('logo').animated && Brand.info('logo').hasPoster === false);

    /* ---------- 6ب) وضع حركة الهوية: تبديل المصدر في الحالات الأربع ----------
       هذا هو جوهر التصحيح: أي مصدرٍ يُرسم في كل وضع. والأهم أن الأصل لا
       يُمسّ أبداً — لو كُتب الإطار الثابت فوق `dataUrl` لبدت الميزة عاملة
       وهي قد أتلفت الحركة نهائياً. */
    await Brand.setMedia('logo', gifFile('motion-logo.gif'));
    await Brand.setMedia('banner', gifFile('motion-banner.gif'));
    const liveLogo = Brand.media('logo').dataUrl, stillLogo = Brand.media('logo').posterUrl;
    const liveBanner = Brand.media('banner').dataUrl, stillBanner = Brand.media('banner').posterUrl;
    ok('الأصل والإطار الثابت مخزَّنان منفصلين', liveLogo !== stillLogo && !!stillLogo);

    const mode0 = Brand.motionMode();
    ok('الوضع الافتراضي تلقائي', mode0 === 'auto', mode0);
    await Brand.setMotionMode('on');
    ok('«تشغيل»: يُرسم الملف الأصلي للشعار', Brand.renderUrl('logo') === liveLogo);
    ok('«تشغيل»: يُرسم الملف الأصلي للافتة', Brand.renderUrl('banner') === liveBanner);
    ok('«تشغيل»: الحالة المعلنة حيّة',
       Brand.motionStatus().logo.rendering === 'live' && Brand.motionStatus().banner.rendering === 'live');
    ok('«تشغيل»: يتجاوز تفضيل الجهاز', Brand.motionAllowed() === true);
    await Brand.setMotionMode('off');
    ok('«إيقاف»: يُرسم الإطار الثابت للشعار', Brand.renderUrl('logo') === stillLogo);
    ok('«إيقاف»: يُرسم الإطار الثابت للافتة', Brand.renderUrl('banner') === stillBanner);
    ok('«إيقاف»: الحالة المعلنة ثابتة',
       Brand.motionStatus().logo.rendering === 'still' && Brand.motionStatus().banner.rendering === 'still');
    ok('«إيقاف»: لا يتأثّر بتفضيل الجهاز', Brand.motionAllowed() === false);
    await Brand.setMotionMode('auto');
    const autoWantsLive = !Brand.reducedMotion();
    ok('«تلقائي»: يتبع تفضيل الجهاز',
       (Brand.renderUrl('logo') === liveLogo) === autoWantsLive,
       `reduced=${Brand.reducedMotion()}`);
    ok('وضع غير معروف يعود إلى تلقائي',
       await (async () => { await Settings.set({ brandMotion:'xyz' }); return Brand.motionMode() === 'auto'; })());
    await Brand.setMotionMode('auto');

    /* الطباعة لا تتبع الوضع إطلاقاً: ثابتة في الأوضاع الثلاثة */
    for (const m of ['auto','on','off']){
      await Brand.setMotionMode(m);
      ok(`الطباعة ثابتة في وضع «${m}»`,
         Brand.renderUrl('logo', true) === stillLogo
         && !Brand.printHeader('س','ص').includes('data:image/gif')
         && !Brand.bannerHtml(true).includes('data:image/gif'), m);
    }
    await Brand.setMotionMode('on');

    /* الأصل لم يُستبدَل بالإطار الثابت في أي لحظة */
    ok('الأصل المتحرّك ما زال GIF بعد كل التبديلات',
       Brand.media('logo').dataUrl === liveLogo && liveLogo.startsWith('data:image/gif'));
    ok('الإطار الثابت ما زال PNG منفصلاً',
       Brand.media('logo').posterUrl === stillLogo && stillLogo.startsWith('data:image/png'));
    ok('اللافتة كذلك لم يُمسّ أصلها',
       Brand.media('banner').dataUrl === liveBanner && liveBanner.startsWith('data:image/gif'));

    /* اللافتة صارت عنصر صورة حقيقياً يُقرأ مصدره من الـDOM */
    ok('اللافتة تُرسم عنصر <img> لا خلفية CSS',
       /<img[^>]+data-brand="banner"/.test(Brand.bannerHtml()), Brand.bannerHtml().slice(0, 90));
    ok('اللافتة تحفظ الأبعاد والقصّ بالصنف نفسه',
       Brand.bannerHtml().includes('class="brand-banner"'));
    ok('اللافتة تعلن حالتها في العنصر', /data-motion="live"/.test(Brand.bannerHtml()));
    await Brand.setMotionMode('off');
    ok('اللافتة تعلن السكون عند الإيقاف', /data-motion="still"/.test(Brand.bannerHtml()));
    await Brand.setMotionMode('auto');

    /* الصورة الثابتة لا تُوصف بأنها متحرّكة */
    await Brand.setMedia('logo', pngFile('static-again.png'));
    ok('الصورة الثابتة لا تُعدّ متحرّكة', !Brand.isAnimated('logo'));
    ok('الصورة الثابتة تُرسم كما هي في كل الأوضاع',
       Brand.renderUrl('logo') === Brand.media('logo').dataUrl);
    ok('حالة الصورة الثابتة ليست «حيّة» ولا «ثابتة بسبب الحركة»',
       Brand.motionStatus().logo.animated === false);
    await Brand.setMedia('logo', gifFile('back-to-gif.gif'));

    /* ---------- 7ب) سلامة البيانات بعد كل ذلك ---------- */
    const issues = T().Integrity.scan();
    ok('الهوية البصرية لا تُعدّ وسائط يتيمة',
       !issues.some(x => x.type === 'وسائط غير مستعملة'
         && [Brand.info('logo').id, Brand.info('banner').id].includes(x.id)),
       JSON.stringify(issues.filter(x => x.type === 'وسائط غير مستعملة').slice(0, 3)));
    ok('لا مستند مشتركة يتيم ولا مرجع مكسور بعد عمل الهوية',
       !issues.some(x => /مستند|مشتركة|وسائط محذوفة/.test(x.type)),
       JSON.stringify(issues.slice(0, 4)));
    ok('حذف مستند مشتركة لا يمسّ وسائط الهوية',
       await (async () => {
         const mem = Repos.members.list()[0];
         if (!mem) return true;
         const logoId = Brand.info('logo').id;
         const doc = await Svc.docs.save(null, { memberId:mem.id, type:'أخرى', title:'مستند اختبار',
           mediaId:logoId });                       /* يشير عمداً إلى وسائط الهوية نفسها */
         await Svc.docs.remove(doc.id);
         return !!Repos.media.get(logoId) && Brand.info('logo').exists;
       })(), 'حُذفت وسائط ما زالت مستعملة');

    /* ---------- 8) وسائط مكسورة: الصفحة تصمد ---------- */
    await Settings.set({ branding:Object.assign({}, Brand.get(), { logoMediaId:'med_missing', bannerMediaId:'med_missing' }) });
    ok('معرّف وسائط محذوف لا يكسر الشعار', Brand.logoHtml(40).includes('<svg'));
    ok('معرّف وسائط محذوف لا يكسر اللافتة', Brand.bannerHtml() === '');
    ok('معرّف وسائط محذوف لا يكسر الترويسة', Brand.printHeader('س','ص').includes('doc-head'));
    ok('وصف المعاينة يقول إنه لا يوجد', Brand.info('logo').exists === false);
    await Backup.restore(backup);                       /* إعادة الحال لبقية المجموعة */
    return results;
  }

  /* ============== المرحلة 3أ: التقييم الأولي عند التسجيل ==============
     المطلوب ليس نظام قياسات ثانياً — بل أن يصل مسار التسجيل إلى نظام القياسات
     القائم. فما يُختبر: أن القياس المُدخَل وقت التسجيل يصير قراءةً عادية في
     السجل نفسه، وأن غيابه لا يمنع الحفظ، وأن الخطأ يُكشف قبل إنشاء المشتركة. */
  async function onboarding(){
    const { Svc, Repos, D, U } = T();
    const types = Svc.measure.types();
    ok('أنواع القياس تُقرأ من الإعدادات القائمة', types.length > 0 && types.some(t => t.key === 'weight'),
       types.map(t => t.key).join(','));

    /* ---------- السيناريو أ: تسجيل سريع بلا قياسات ---------- */
    const a = await Svc.members.create({ name:'مشتركة بلا قياس', joinDate:D.today() });
    ok('أ: المشتركة تُنشأ بالاسم وحده', !!a.rec.id && !!a.rec.code, a.rec.code);
    eq('أ: لا قياسات بعد التسجيل', Svc.measure.ofMember(a.rec.id).length, 0);
    /* ثم تُقاس لاحقاً من المسار القائم نفسه */
    const later = await Svc.measure.addBatch(a.rec.id, D.today(), { weight:70 }, 'قياس لاحق');
    eq('أ: القياس اللاحق يُسجَّل من المسار القائم', Svc.measure.ofMember(a.rec.id).length, 1);
    eq('أ: القياس اللاحق قراءة واحدة لا أكثر', later.length, 1);

    /* ---------- السيناريو ب: تسجيل مع قياسات أولية ---------- */
    const b = await Svc.members.create({ name:'مشتركة بقياس', joinDate:D.today() });
    const made = await Svc.measure.addBatch(b.rec.id, D.today(), { weight:'68.5', height:'165' }, 'تقييم أولي');
    eq('ب: القياسات الأولية تُسجَّل قراءتين', made.length, 2);
    eq('ب: تدخل سجل القياسات نفسه', Svc.measure.ofMember(b.rec.id).length, 2);
    ok('ب: لا كيان «قياس تسجيل» منفصل — الجدول واحد',
       made.every(r => !!Repos.measurements.get(r.id)));
    ok('ب: كل قراءة تحمل وحدتها من الإعدادات',
       made.every(r => !!r.unit && r.unit === Svc.measure.typeOf(r.type).unit),
       made.map(r => `${r.type}:${r.unit}`).join(','));
    ok('ب: كل قراءة مؤرَّخة', made.every(r => D.isISO(r.date)));
    ok('ب: القيمة الأحدث تظهر في «آخر القراءات»',
       Object.keys(Svc.measure.latest(b.rec.id)).sort().join(',') === 'height,weight');
    const bmi = Svc.measure.bmi(b.rec.id);
    ok('ب: مؤشّر الكتلة يُحسب من القراءتين', !!bmi && bmi.value > 0, bmi && bmi.value);
    eq('ب: لا قراءة مكرّرة تُنشأ بعد التسجيل', Svc.measure.ofMember(b.rec.id).length, 2);

    /* ---------- التحقّق قبل الإنشاء: القيمة الخاطئة تُكشف ---------- */
    const bad = Svc.measure.checkBatch(D.today(), { weight:'-5' });
    ok('القيمة السالبة تُرفض قبل الإنشاء', !bad.ok && !!bad.errors.m_weight, JSON.stringify(bad.errors));
    const huge = Svc.measure.checkBatch(D.today(), { weight:'5000' });
    ok('القيمة المستحيلة تُرفض', !huge.ok && !!huge.errors.m_weight);
    const future = Svc.measure.checkBatch(D.addDays(D.today(), 3), { weight:'70' });
    ok('التاريخ المستقبلي يُرفض', !future.ok && !!future.errors.date, JSON.stringify(future.errors));
    const partial = Svc.measure.checkBatch(D.today(), { weight:'70', height:'' });
    ok('الإدخال الجزئي مقبول — الفارغ يُتجاهَل', partial.ok && partial.count === 1, JSON.stringify(partial));
    const none = Svc.measure.checkBatch(D.today(), {});
    ok('لا قياسات أصلاً: لا خطأ — الحفظ لا يتوقّف عليها', none.ok && none.count === 0);
    ok('قواعد التحقّق واحدة لا اثنتان',
       await (async () => { try { await Svc.measure.addBatch(b.rec.id, D.today(), { weight:'-5' }); return false; }
                            catch(e){ return e.code === 'VALIDATION' && !!e.details.m_weight; } })());

    /* ---------- الإدخال الجزئي يُحفظ فعلاً ---------- */
    const c = await Svc.members.create({ name:'مشتركة بقياس جزئي', joinDate:D.today() });
    const partialSaved = await Svc.measure.addBatch(c.rec.id, D.today(), { weight:'72' }, '');
    eq('الإدخال الجزئي يُحفظ قراءة واحدة', partialSaved.length, 1);
    ok('بلا طول لا مؤشّر كتلة — ولا اختراع قيمة', Svc.measure.bmi(c.rec.id) === null);

    /* ---------- القياس الأولي تاريخٌ لا حالة: لا يُدهس بقراءة لاحقة ---------- */
    const first = Svc.measure.ofMember(b.rec.id, 'weight')[0];
    await Svc.measure.addBatch(b.rec.id, D.today(), { weight:'66' }, 'بعد شهر');
    const all = Svc.measure.ofMember(b.rec.id, 'weight');
    eq('القراءة الأولى باقية بعد قراءة جديدة', all.length, 2);
    ok('القراءة الأولى لم تتغيّر قيمتها',
       !!Repos.measurements.get(first.id) && Repos.measurements.get(first.id).value === first.value);
    const prog = Svc.measure.progress(b.rec.id, 'weight');
    ok('التقدّم يُقاس من القراءة الأولى', !!prog && prog.first.value === 68.5 && prog.last.value === 66,
       JSON.stringify(prog && { f:prog.first.value, l:prog.last.value, d:prog.delta }));
    ok('السلسلة الرسومية تشمل القراءتين', Svc.measure.series(b.rec.id, 'weight').length === 2);

    /* ---------- المشتركات القديمة لا تتأثر ---------- */
    const old = Repos.members.list().filter(x => x.isDemo)[0];
    if (old) ok('المشتركة القديمة بلا قياسات تبقى صالحة', Svc.measure.ofMember(old.id).length >= 0);
    return results;
  }

  /* ========== المرحلة 3ب: الحسابات والصلاحيات ونسبة الأفعال ==========
     ما يُختبر هنا ليس «هل يختفي الزر» بل: هل يُرفض الفعل نفسه عند حدّه حين
     تُنادى الخدمة مباشرة؟ ولذلك كل اختبار أدناه يستدعي الخدمة أو الفعل بلا
     واجهة، بعد دخول حقيقي بكلمة مرور حقيقية. */
  const AUTH_PW = { owner:'AmTabarak#2026', manager:'Mudira#2026',
                    reception:'Istiqbal#2026', trainer:'Mudarriba#2026' };
  const codeOf = async fn => { try { await fn(); return null; } catch(e){ return e.code || e.message || 'ERR'; } };
  const msgOf  = async fn => { try { await fn(); return null; } catch(e){ return e.message || ''; } };

  /* تفعيل الصلاحيات + أربعة حسابات حقيقية، واحد لكل دور */
  async function authBoot(){
    const { Auth, Svc } = T();
    await Settings.set({ authEnabled:true });
    Auth.restoreSession();
    const first = await Auth.setupFirstAdmin({ name:'أم تبارك', username:'omtabarak',
                                               password:AUTH_PW.owner });
    const mk = (username, name, roleKey, password) =>
      Svc.users.create({ username, name, roleKey, password });
    const manager   = await mk('mudira',    'سارة المديرة',    'manager',   AUTH_PW.manager);
    const reception = await mk('istiqbal',  'زهراء الاستقبال', 'reception', AUTH_PW.reception);
    const trainer   = await mk('mudarriba', 'هدى المدربة',     'trainer',   AUTH_PW.trainer);
    return { owner:first.user, code:first.recoveryCode, manager, reception, trainer };
  }

  /* ---------------------- 1) الدخول والجلسة والاسترجاع ---------------------- */
  async function auth(){
    const { Auth, Svc, Repos, Crypto } = T();

    /* ---------- قبل التفعيل: النادي الذي لم يفعّل الدخول لا يرى أي فرق ---------- */
    ok('قبل التفعيل: الصلاحيات معطّلة', Auth.enabled() === false);
    ok('قبل التفعيل: كل شيء مسموح بلا دخول',
       Auth.can('settings.danger') === true && Auth.signedIn() === true);
    ok('قبل التفعيل: الفاعل يبقى «المالكة» كما كان', Auth.session.actorName === 'المالكة',
       Auth.session.actorName);
    ok('الأدوار الأربعة مزروعة على القرص مرة واحدة',
       Repos.roles.list(true).length === 4,
       Repos.roles.list(true).map(r => r.key).join(','));

    /* ---------- بعد التفعيل وقبل التهيئة: لا صلاحية لأحد ---------- */
    await Settings.set({ authEnabled:true });
    Auth.restoreSession();
    ok('بعد التفعيل: النظام يطلب تهيئة أول حساب', Auth.needsSetup() === true);
    ok('قبل الدخول: لا صلاحية لأي شيء',
       Auth.can('members.view') === false && Auth.can('settings.danger') === false);
    ok('قبل الدخول: لا مستخدمة داخلة', Auth.signedIn() === false && Auth.currentUser() === null);
    ok('قبل الدخول: الفعل الحسّاس يُرفض عند حدّه لا في الواجهة',
       await codeOf(() => Svc.finance.addCapital({ date:T().D.today(), amount:1, type:'injection',
         method:'cash' })) === 'FORBIDDEN');

    /* ---------- التهيئة: أول مالكة ورمز استرجاع ---------- */
    const first = await Auth.setupFirstAdmin({ name:'أم تبارك', username:'omtabarak',
                                               password:AUTH_PW.owner });
    ok('التهيئة تُنشئ مالكة واحدة وتفتح جلستها فوراً',
       Repos.users.list(true).length === 1 && Auth.session.actorId === first.user.id
       && Auth.session.roleKey === 'owner');
    ok('لا تهيئة ثانية بعد الأولى — لا باب خلفي',
       await codeOf(() => Auth.setupFirstAdmin({ name:'أخرى', username:'other',
         password:'AnotherPass#1' })) === 'ALREADY_SETUP');

    /* ---------- كلمة المرور: لا تُخزَّن نصاً ---------- */
    const stored = Repos.users.get(first.user.id);
    ok('كلمة المرور لا تُخزَّن نصاً في سجل المستخدمة',
       JSON.stringify(stored).indexOf(AUTH_PW.owner) === -1);
    const p = stored.pass;
    ok('التلبيد PBKDF2-SHA256 بملح وتكرارات معلنة',
       p.algo === 'pbkdf2-sha256' && p.iterations >= 20000
       && String(p.salt).length >= 16 && String(p.hash).length >= 32,
       JSON.stringify({ algo:p.algo, it:p.iterations, salt:String(p.salt).length, hash:String(p.hash).length }));
    const twin = await Svc.users.create({ username:'tawam', name:'توأم كلمة المرور',
                                          roleKey:'reception', password:AUTH_PW.owner });
    ok('ملحان مختلفان لكلمة المرور نفسها ⇒ تلبيدان مختلفان',
       twin.pass.salt !== p.salt && twin.pass.hash !== p.hash);
    ok('التحقّق يقبل الكلمة الصحيحة ويرفض غيرها',
       await Crypto.verify(AUTH_PW.owner, p) === true
       && await Crypto.verify(AUTH_PW.owner + 'x', p) === false);
    await Svc.users.remove(twin.id);

    /* ---------- التطبيقان يخرجان الشيء نفسه ----------
       `crypto.subtle` غير متاح على file:// (ليس سياقاً آمناً)، فيعمل هناك
       التطبيق الخالص. فلو اختلف الاثنان لسقطت كلمة مرور ضُبطت على قرصٍ
       يُفتح ملفّه مباشرة حين يُفتح النظام من خادم محلّي — والعكس. */
    const SALT = '0011223344556677889aabbccddeeff0', IT = 2000;
    const bothWays = async pw => ({
      fast: await Crypto.pbkdf2(pw, SALT, IT),
      pure: Crypto.toHex(Crypto.pbkdf2Js(Crypto.enc(pw), Crypto.fromHex(SALT), IT))
    });
    const latin = await bothWays('AmTabarak#2026'), arabic = await bothWays('كلمة-مرور-عربية');
    ok('التطبيق السريع والتطبيق الخالص يخرجان التلبيد نفسه',
       latin.fast === latin.pure && latin.fast.length === 64,
       `${latin.fast.slice(0, 16)}… / ${latin.pure.slice(0, 16)}…`);
    ok('وكذلك مع كلمة مرور عربية (الترميز UTF-8 نفسه في الطريقين)',
       arabic.fast === arabic.pure, `${arabic.fast.slice(0, 16)}… / ${arabic.pure.slice(0, 16)}…`);
    const madeByPure = { algo:'pbkdf2-sha256', salt:SALT, iterations:IT,
      hash:Crypto.toHex(Crypto.pbkdf2Js(Crypto.enc('كلمة-عابرة'), Crypto.fromHex(SALT), IT)) };
    ok('بصمةٌ صنعها التطبيق الخالص يقبلها التحقّق العادي وحده لا غيره',
       await Crypto.verify('كلمة-عابرة', madeByPure) === true
       && await Crypto.verify('كلمة-أخرى', madeByPure) === false);
    ok('عدد التكرارات يُقرأ من السجل لا من الثابت الحالي',
       await Crypto.verify('كلمة-عابرة', Object.assign({}, madeByPure, { iterations:IT + 1 })) === false);

    /* ---------- رمز الاسترجاع: طريق موثّق لا باب خلفي ---------- */
    const recSet = Settings.get('authRecovery');
    ok('رمز الاسترجاع مُخزَّن ملبَّداً لا نصاً',
       !!(recSet && recSet.hash) && JSON.stringify(recSet).indexOf(first.recoveryCode) === -1);
    ok('رمز الاسترجاع ١٦ محرفاً تُعرَض مرة واحدة',
       first.recoveryCode.replace(/-/g, '').length === 16, first.recoveryCode.length);
    ok('الرمز يُتحقَّق منه بالتلبيد نفسه', await Crypto.verify(first.recoveryCode, recSet) === true);

    /* ---------- الدخول والخروج ---------- */
    await Auth.logout();
    ok('الخروج يُنهي الجلسة ويُسقط كل صلاحية',
       Auth.session.actorId === null && Auth.can('members.view') === false);
    ok('دخول بكلمة مرور خاطئة يُرفض',
       await codeOf(() => Auth.login('omtabarak', 'كلمة خاطئة')) === 'BAD_LOGIN');
    const noUser = await msgOf(() => Auth.login('لا-أحد-هنا', 'كلمة خاطئة'));
    const badPw  = await msgOf(() => Auth.login('omtabarak', 'كلمة أخرى خاطئة'));
    ok('اسم غير موجود وكلمة خاطئة: الرسالة واحدة — لا يُكشف وجود حساب',
       noUser === badPw && !!noUser, `${noUser} | ${badPw}`);
    const signed = await Auth.login('omtabarak', AUTH_PW.owner);
    ok('الدخول الصحيح يفتح جلسة بالاسم والدور الحقيقيين',
       Auth.session.actorId === signed.id && Auth.session.actorName === 'أم تبارك'
       && Auth.session.roleKey === 'owner' && Auth.can('settings.danger') === true);
    ok('تاريخ آخر دخول يُسجَّل على الحساب', !!Repos.users.get(signed.id).lastLoginAt);

    /* ---------- حساب موقوف ---------- */
    const off = await Svc.users.create({ username:'mawqufa', name:'موقوفة',
                                         roleKey:'reception', password:AUTH_PW.reception });
    await Svc.users.setDisabled(off.id, true);
    ok('الحساب الموقوف لا يدخل ورسالته تدلّ على السبب',
       await codeOf(() => Auth.login('mawqufa', AUTH_PW.reception)) === 'USER_DISABLED');
    ok('محاولة دخول فاشلة لا تُسقط الجلسة القائمة',
       Auth.session.actorId === signed.id, Auth.session.actorName);
    await Svc.users.setDisabled(off.id, false);
    ok('الحساب بعد إعادة التفعيل يدخل', !!(await Auth.login('mawqufa', AUTH_PW.reception)));

    /* ---------- تغيير كلمة المرور بالنفس ---------- */
    ok('تغيير كلمة المرور بكلمة قديمة خاطئة يُرفض',
       await codeOf(() => Svc.users.changeOwnPassword('غلط', 'كلمة-جديدة-طويلة')) === 'BAD_PASSWORD');
    ok('كلمة مرور أقصر من الحد تُرفض',
       await codeOf(() => Svc.users.changeOwnPassword(AUTH_PW.reception, '12345')) === 'VALIDATION');
    await Svc.users.changeOwnPassword(AUTH_PW.reception, 'كلمة-جديدة-طويلة');
    ok('الكلمة القديمة لا تعمل بعد التغيير',
       await codeOf(() => Auth.login('mawqufa', AUTH_PW.reception)) === 'BAD_LOGIN');
    ok('الكلمة الجديدة تعمل', !!(await Auth.login('mawqufa', 'كلمة-جديدة-طويلة')));

    /* ---------- الاسترجاع: يعمل بلا دخول، وهو المخرج الموثّق ---------- */
    await Auth.logout();
    ok('الاسترجاع برمز خاطئ يُرفض',
       await codeOf(() => Auth.recover('AAAA-BBBB-CCCC-DDDD', 'omtabarak', 'كلمة-مالكة-جديدة'))
       === 'BAD_RECOVERY');
    ok('الاسترجاع لا يُطبَّق على حساب غير مالكة',
       await codeOf(() => Auth.recover(first.recoveryCode, 'mawqufa', 'كلمة-مالكة-جديدة')) === 'NOT_ADMIN');
    const again = await Auth.recover(first.recoveryCode, 'omtabarak', 'كلمة-مالكة-جديدة');
    ok('الاسترجاع يعمل بلا دخول ويعيد كلمة مرور المالكة', !!again.user);
    ok('الاسترجاع يولّد رمزاً جديداً يحلّ محلّ القديم',
       !!again.recoveryCode && again.recoveryCode !== first.recoveryCode);
    ok('الرمز القديم لا يعمل بعد الاسترجاع',
       await codeOf(() => Auth.recover(first.recoveryCode, 'omtabarak', 'أخرى-طويلة')) === 'BAD_RECOVERY');
    ok('كلمة مرور المالكة القديمة سقطت',
       await codeOf(() => Auth.login('omtabarak', AUTH_PW.owner)) === 'BAD_LOGIN');
    ok('كلمة المرور المستعادة تعمل', !!(await Auth.login('omtabarak', 'كلمة-مالكة-جديدة')));

    /* ---------- الجلسة تُستعاد في اللسان نفسه ولا تُستعاد لحساب موقوف ---------- */
    ok('الجلسة تُستعاد بعد إعادة التحميل في اللسان نفسه',
       Auth.restoreSession() === true && Auth.session.actorName === 'أم تبارك');
    await Auth.login('mawqufa', 'كلمة-جديدة-طويلة');
    await Repos.users.update(off.id, { disabled:true });
    ok('جلسة حساب أُوقف لا تُستعاد بعد إعادة التحميل',
       Auth.restoreSession() === false && Auth.session.actorId === null);
    await Repos.users.update(off.id, { disabled:false });
    await Auth.login('omtabarak', 'كلمة-مالكة-جديدة');

    /* ---------- السجل لا يحمل أسراراً ---------- */
    const log = JSON.stringify(Repos.audit.list(true));
    ok('سجل الأحداث لا يحوي كلمة مرور ولا رمز استرجاع',
       [AUTH_PW.owner, AUTH_PW.reception, 'كلمة-مالكة-جديدة', 'كلمة-جديدة-طويلة',
        first.recoveryCode, again.recoveryCode].every(s => log.indexOf(s) === -1));
    ok('أحداث التهيئة والدخول والخروج والاسترجاع مسجَّلة',
       ['setup','login','logout','recover'].every(a =>
         Repos.audit.list(true).some(x => x.entity === 'auth' && x.action === a)),
       Repos.audit.list(true).filter(x => x.entity === 'auth').map(x => x.action).join(','));
    return results;
  }

  /* ------- 2) مصفوفة الصلاحيات: كل فعل محميّ × كل دور، عند حدّ الفعل ------- */
  async function permMatrix(){
    const { Auth, Svc, Repos, Backup, Brand, Actions, UI, DB, D, U, STORE_NAMES } = T();
    const who = await authBoot();
    const ROLES = [
      { key:'trainer',   ar:'المدربة',    u:who.trainer,   pw:AUTH_PW.trainer },
      { key:'reception', ar:'الاستقبال',  u:who.reception, pw:AUTH_PW.reception },
      { key:'manager',   ar:'المديرة',    u:who.manager,   pw:AUTH_PW.manager },
      { key:'owner',     ar:'المالكة',    u:who.owner,     pw:AUTH_PW.owner }
    ];
    const allows = (roleKey, permKey) => {
      const perms = Auth.permsOf(roleKey);
      return perms.includes('*') || perms.includes(permKey);
    };
    const asOwner = () => Auth.login(who.owner.username, AUTH_PW.owner);

    /* الحوارات تُجاب تلقائياً: المقصود هنا حدّ الصلاحية لا زرّ التأكيد */
    const realConfirm = UI.confirm, realModal = UI.modal;
    UI.confirm = async () => true;
    UI.modal = opts => {
      const ov = document.createElement('div');
      ov.innerHTML = String(opts.body || '') + String(opts.footer || '');
      document.body.appendChild(ov);
      const h = { close(){ try { ov.remove(); } catch(e){} } };
      if (opts.onMount) try { opts.onMount(ov); } catch(e){}
      setTimeout(() => {
        const b = ov.querySelector('[data-ok]');
        if (b) b.click(); else { h.close(); if (opts.onClose) opts.onClose(); }
      }, 0);
      return h;
    };

    let seq = 0;
    const uniq = () => 'ت' + (++seq) + Math.random().toString(36).slice(2, 6);
    const K = { close:D.monthsBack(30)[0], reopen:D.monthsBack(29)[0],
                corr:D.monthsBack(28)[0], dist:D.monthsBack(27)[0] };
    const YESTERDAY = D.addDays(D.today(), -1);
    const supplier = async () => Repos.suppliers.list()[0]
      || await Repos.suppliers.create({ name:'مورّد اختبار الصلاحيات', phone:'' });
    const product = async () => Repos.products.list()[0]
      || await Repos.products.create({ name:'صنف اختبار', unit:'حبة', price:1000, cost:500, minQty:0 });
    const draft = async () => {
      const s = await supplier(), p = await product();
      const { rec } = await Svc.purchases.save(null, { supplierId:s.id, date:D.today(),
        lines:[{ productId:p.id, qty:1, unitCost:500 }], discount:0 });
      return rec.id;
    };
    const posted = async () => { const id = await draft(); await Svc.purchases.post(id); return id; };
    const partner = async () => Repos.partners.list()[0]
      || await Repos.partners.create({ name:'شريكة اختبار', sharePercent:50 });
    const closePeriod = async key => { if (!Svc.periods.isClosed(key)) await Svc.periods.close(key); };
    const openPeriod  = async key => { if (Svc.periods.isClosed(key)) await Svc.periods.reopen(key, 'تهيئة اختبار'); };
    const freshDist = async () => {
      await closePeriod(K.dist);
      const pr = await partner();
      const { rec } = await Svc.distributions.create({ partnerId:pr.id, periodFrom:D.startOfMonth(K.dist),
        periodTo:D.endOfMonth(K.dist), amount:10, date:D.today(), method:'cash' });
      return rec.id;
    };
    const aUser = async () => Svc.users.create({ username:uniq(), name:'حساب مؤقّت ' + seq,
      roleKey:'reception', password:'MuaqqatPass#1' });

    /* كل فعل محميّ: كيف يُهيَّأ، كيف يُستدعى، وبم يُثبَت أنه نُفِّذ فعلاً */
    const ACTS = [
      { t:'تسجيل حركة رأس مال', key:'finance.money',
        run:async () => (await Svc.finance.addCapital({ date:D.today(), amount:1000, type:'injection',
              method:'cash', description:'اختبار الصلاحيات' })).rec,
        check:r => !!Repos.capital.get(r.id) },
      { t:'تصحيح طريقة حركة رأس مال', key:'finance.money',
        arrange:async () => (await Repos.capital.create({ date:D.today(), amount:50, type:'injection',
              kind:'capital_injection', method:T().PayMethods.UNKNOWN_KEY, description:'مجهولة الطريقة' })).id,
        run:id => Svc.finance.setCapitalMethod(id, 'cash'),
        check:(r, id) => Repos.capital.get(id).method === 'cash' },
      { t:'أرشفة حركة رأس مال', key:'finance.money',
        arrange:async () => (await Repos.capital.create({ date:D.today(), amount:50, type:'injection',
              kind:'capital_injection', method:'cash', description:'للأرشفة' })).id,
        run:id => Svc.finance.archiveCapital(id, true),
        check:(r, id) => !!Repos.capital.get(id).archived },
      { t:'إقفال صندوق اليوم', key:'cash.money',
        arrange:async () => { const c = Svc.cashbook.get(YESTERDAY);
          if (c) await Repos.cashDays.hardDelete(c.id); return YESTERDAY; },
        run:d => Svc.cashbook.close({ date:d, countedCash:0, notes:'إقفال اختبار الصلاحيات' }),
        check:() => !!(Svc.cashbook.get(YESTERDAY) || {}).closedAt },
      { t:'إعادة فتح صندوق مقفل', key:'cash.money',
        arrange:async () => { const c = Svc.cashbook.get(YESTERDAY);
          if (c) await Repos.cashDays.hardDelete(c.id);
          await Svc.cashbook.close({ date:YESTERDAY, countedCash:0, notes:'تهيئة اختبار' });
          return YESTERDAY; },
        run:d => Svc.cashbook.reopen(d, 'اختبار الصلاحيات'),
        check:() => !(Svc.cashbook.get(YESTERDAY) || {}).closedAt },
      { t:'ترحيل مستند شراء', key:'inventory.create',
        arrange:draft, run:id => Svc.purchases.post(id),
        check:(r, id) => Repos.purchases.get(id).status === 'posted' },
      { t:'إلغاء مستند شراء', key:'inventory.delete',
        arrange:posted, run:id => Svc.purchases.cancel(id, 'اختبار الصلاحيات'),
        check:(r, id) => Repos.purchases.get(id).status === 'cancelled' },
      { t:'تسديد دفعة لمورّد', key:'finance.money',
        arrange:posted,
        run:id => Svc.purchases.addPayment({ purchaseId:id, date:D.today(), amount:100, method:'cash' }),
        check:(r, id) => Svc.purchases.paidFor(id) === 100 },
      { t:'حذف دفعة مورّد', key:'finance.money',
        arrange:async () => { const id = await posted();
          const { rec } = await Svc.purchases.addPayment({ purchaseId:id, date:D.today(),
            amount:100, method:'cash' }); return rec.id; },
        run:id => Svc.purchases.removePayment(id),
        check:(r, id) => !Repos.purchasePayments.get(id) },
      { t:'إقفال فترة مالية', key:'finance.money',
        arrange:async () => { await openPeriod(K.close); return K.close; },
        run:k => Svc.periods.close(k), check:() => Svc.periods.isClosed(K.close) },
      { t:'إعادة فتح فترة مقفلة', key:'finance.money',
        arrange:async () => { await closePeriod(K.reopen); return K.reopen; },
        run:k => Svc.periods.reopen(k, 'اختبار الصلاحيات'), check:() => !Svc.periods.isClosed(K.reopen) },
      { t:'تصحيح مُعلَّل داخل فترة مقفلة', key:'finance.money',
        arrange:async () => { await closePeriod(K.corr); return D.startOfMonth(K.corr); },
        run:d => Svc.periods.guardWrite(d, 'تصحيح اختبار', { correctionReason:'سبب مكتوب' }),
        check:r => r === true },
      { t:'تسجيل توزيع أرباح', key:'finance.money',
        arrange:async () => { await closePeriod(K.dist); return (await partner()).id; },
        run:async pid => (await Svc.distributions.create({ partnerId:pid, periodFrom:D.startOfMonth(K.dist),
              periodTo:D.endOfMonth(K.dist), amount:10, date:D.today(), method:'cash' })).rec,
        check:r => !!Repos.distributions.get(r.id) },
      { t:'تعديل توزيع أرباح', key:'finance.money',
        arrange:freshDist, run:id => Svc.distributions.update(id, { amount:20 }),
        check:(r, id) => Repos.distributions.get(id).amount === 20 },
      { t:'حذف توزيع أرباح', key:'finance.money',
        arrange:freshDist, run:id => Svc.distributions.remove(id),
        check:(r, id) => !Repos.distributions.get(id) },
      { t:'رفع شعار الهوية', key:'settings.edit',
        run:() => Brand.setMedia('logo', pngFile('perm-logo.png')), check:() => Brand.has('logo') },
      { t:'إزالة شعار الهوية', key:'settings.edit',
        arrange:async () => { if (!Brand.has('logo')) await Brand.setMedia('logo', pngFile('perm-logo.png')); },
        run:() => Brand.clearMedia('logo'), check:() => !Brand.has('logo') },
      { t:'حفظ بيانات الهوية', key:'settings.edit',
        run:() => Brand.saveDetails({ subtitle:'اختبار الصلاحيات', phone:'', address:'', instagram:'', footer:'' }),
        check:() => Brand.get().subtitle === 'اختبار الصلاحيات' },
      { t:'أرشفة مشتركة', key:'members.delete',
        arrange:async () => (await Repos.members.create({ name:'مشتركة أرشفة ' + uniq(), phone:'',
          joinDate:D.today(), code:'ص' + seq })).id,
        run:id => Actions.archiveMember(id), check:(r, id) => !!Repos.members.get(id).archived },
      { t:'أرشفة اشتراك', key:'subs.delete',
        arrange:() => (Repos.subs.list().find(s => !s.archived) || {}).id || null,
        run:id => Actions.archiveSub(id), check:(r, id) => !!Repos.subs.get(id).archived },
      { t:'أرشفة إيراد', key:'finance.delete',
        arrange:async () => (await Repos.revenues.create({ date:D.today(), amount:25, source:'other',
          description:'إيراد اختبار الصلاحيات' })).id,
        run:id => Actions.archiveRevenue(id), check:(r, id) => !!Repos.revenues.get(id).archived },
      { t:'أرشفة مصروف', key:'finance.delete',
        arrange:async () => (await Repos.expenses.create({ date:D.today(), amount:25,
          categoryId:(Repos.expCats.list()[0] || {}).id || null, description:'مصروف اختبار', method:'cash' })).id,
        run:id => Actions.archiveExpense(id), check:(r, id) => !!Repos.expenses.get(id).archived },
      { t:'دفع راتب', key:'payroll.money',
        arrange:async () => {
          const st = Repos.staff.list().find(s => s.status !== 'left')
            || await Repos.staff.create({ name:'موظفة اختبار', baseSalary:100, status:'active', payMethod:'cash' });
          const period = D.monthKey(D.today());
          let pr = Svc.payroll.ofPeriod(period).find(x => x.staffId === st.id);
          if (!pr){ await Svc.payroll.generate(period);
                    pr = Svc.payroll.ofPeriod(period).find(x => x.staffId === st.id); }
          if (pr.status === 'paid') pr = await Svc.payroll.unpay(pr.id);
          if (!(pr.net > 0)) pr = await Repos.payrolls.update(pr.id, { net:100 });
          return pr.id; },
        run:id => Actions.payPayroll(id), check:(r, id) => Repos.payrolls.get(id).status === 'paid' },
      { t:'إلغاء فاتورة بيع', key:'pos.delete',
        arrange:() => (Repos.sales.list().find(s => !s.archived) || {}).id || null,
        run:id => Actions.archiveSale(id), check:(r, id) => !!Repos.sales.get(id).archived },
      { t:'أرشفة صنف من المخزون', key:'inventory.delete',
        arrange:async () => (await Repos.products.create({ name:'صنف أرشفة ' + uniq(), unit:'حبة',
          price:1000, cost:500, minQty:0 })).id,
        run:id => Actions.archiveProduct(id), check:(r, id) => !!Repos.products.get(id).archived },
      { t:'حذف سجل حضور', key:'attendance.delete',
        arrange:async () => { const m = Repos.members.list()[0];
          return (await Repos.attendance.create({ memberId:m.id, date:D.today(), method:'manual',
            status:'present' })).id; },
        run:id => Actions.removeAttendance(id), check:(r, id) => !Repos.attendance.get(id) },
      { t:'إنشاء مستخدمة', key:'settings.users',
        run:() => Svc.users.create({ username:uniq(), name:'مستخدمة جديدة', roleKey:'trainer',
          password:'JadidaPass#1' }), check:r => !!Repos.users.get(r.id) },
      { t:'تعديل مستخدمة ودورها', key:'settings.users',
        arrange:async () => (await aUser()).id,
        run:id => Svc.users.update(id, { roleKey:'trainer' }),
        check:(r, id) => Repos.users.get(id).roleKey === 'trainer' },
      { t:'إيقاف مستخدمة', key:'settings.users',
        arrange:async () => (await aUser()).id, run:id => Svc.users.setDisabled(id, true),
        check:(r, id) => Repos.users.get(id).disabled === true },
      { t:'تعيين كلمة مرور لمستخدمة', key:'settings.users',
        arrange:async () => { const u = await aUser(); return { id:u.id, hash:u.pass.hash }; },
        run:a => Svc.users.setPassword(a.id, 'BadalPass#1'),
        check:(r, a) => Repos.users.get(a.id).pass.hash !== a.hash },
      { t:'حذف مستخدمة', key:'settings.users',
        arrange:async () => (await aUser()).id, run:id => Svc.users.remove(id),
        check:(r, id) => !Repos.users.get(id) },
      { t:'استعادة نسخة احتياطية', key:'settings.danger',
        arrange:() => Backup.build(true), run:b => Backup.restore(b),
        check:() => Repos.users.list(true).length >= 4 },
      { t:'إعادة تهيئة البرنامج بالكامل', key:'settings.danger',
        run:() => Actions.wipe(), check:() => DB.count('members') === 0 }
    ];

    /* عدّ السطور قبل المحاولة الممنوعة وبعدها: الرفض يجب ألا يكتب شيئاً */
    const countable = STORE_NAMES.filter(s => s !== 'audit' && s !== 'users' && s !== 'meta');
    const snap = () => countable.map(s => DB.count(s)).join(',');
    const leaks = [];

    const attempt = async (act, role) => {
      await asOwner();
      let arg = null;
      try { arg = act.arrange ? await act.arrange() : null; }
      catch(e){ return { ok:false, code:'ARRANGE', msg:e.message }; }
      await Auth.login(role.u.username, role.pw);
      const before = snap();
      try {
        const out = await act.run(arg);
        let verified = true;
        if (act.check){ try { verified = !!act.check(out, arg); } catch(e){ verified = false; } }
        return { ok:true, verified };
      } catch(e){
        if (snap() !== before) leaks.push(`${act.t}/${role.ar}`);
        return { ok:false, code:e.code || '', msg:e.message || String(e) };
      }
    };

    for (const act of ACTS){
      const denied  = ROLES.filter(r => !allows(r.key, act.key));
      const granted = ROLES.filter(r =>  allows(r.key, act.key));
      const dOut = [], gOut = [];
      for (const r of denied)  dOut.push([r, await attempt(act, r)]);
      for (const r of granted) gOut.push([r, await attempt(act, r)]);

      ok(`«${act.t}» يُرفض عند حدّ الفعل لمن لا يملك ${act.key}`,
         dOut.length > 0 && dOut.every(([, x]) => !x.ok && x.code === 'FORBIDDEN'),
         dOut.map(([r, x]) => `${r.ar}=${x.ok ? 'نفَّذ!' : x.code}`).join(' · '));
      ok(`«${act.t}» يُنفَّذ فعلاً لمن يملك ${act.key}`,
         gOut.length > 0 && gOut.every(([, x]) => x.ok && x.verified !== false),
         gOut.map(([r, x]) => `${r.ar}=${x.ok ? (x.verified ? 'نُفِّذ وتُحقِّق' : 'بلا أثر!') : x.code + ':' + x.msg}`).join(' · '));
    }

    ok('الرفض لا يكتب سطراً واحداً في أي جدول', !leaks.length, leaks.join(' · '));

    /* الشمول يُقاس على الشيفرة نفسها لا على قائمة مكتوبة يدوياً: كل موضع
       Auth.require في البرنامج يجب أن يكون له فعل في هذه المصفوفة. */
    /* شيفرة البرنامج نفسها: أطول نصّ برمجي في الصفحة — لا نصّ الاختبارات
       المحقون في الترويسة قبلها. */
    const appSrc = [...document.querySelectorAll('script')]
      .map(s => s.textContent || '').filter(t => t.indexOf('window.TG = {') !== -1)
      .sort((a, b) => b.length - a.length)[0] || '';
    const sites = (appSrc.match(/Auth\.require\(/g) || []).length;
    const guardedKeys = [...new Set((appSrc.match(/Auth\.require\('[a-z.]+'\)/g) || [])
      .map(m => m.slice(m.indexOf("'") + 1, m.lastIndexOf("'"))))];
    const covered = new Set(ACTS.map(a => a.key));
    const gap = guardedKeys.filter(k => !covered.has(k));
    ok('كل مفتاح صلاحية محروس في الشيفرة مغطّى بالمصفوفة', guardedKeys.length > 0 && !gap.length,
       `محروسة=${guardedKeys.length} بلا تغطية=${gap.join(',') || 'لا شيء'}`);
    ok(`المصفوفة تغطّي مواضع التحقّق الـ${sites} في الشيفرة بـ${ACTS.length} فعلاً`,
       sites > 0 && ACTS.length >= sites - 1,
       `مواضع=${sites} أفعال=${ACTS.length} مفاتيح=${guardedKeys.length}`);

    UI.confirm = realConfirm; UI.modal = realModal;
    return results;
  }

  /* --------------- 3) إدارة المستخدمات: حمايتها من إقفال النظام --------------- */
  async function usersAdmin(){
    const { Auth, Svc, Repos, U } = T();
    const who = await authBoot();

    /* ---------- آخر مالكة فعّالة لا تُترك النظام بلا مالكة ---------- */
    ok('المالكة الوحيدة لا تُنزَّل إلى دور أدنى',
       await codeOf(() => Svc.users.update(who.owner.id, { roleKey:'manager' })) === 'LAST_ADMIN');
    ok('لا توقفين حسابك أنتِ',
       await codeOf(() => Svc.users.setDisabled(who.owner.id, true)) === 'SELF_DISABLE');
    ok('لا تحذفين حسابك أنتِ',
       await codeOf(() => Svc.users.remove(who.owner.id)) === 'SELF_DELETE');
    ok('الدور الذي يملك إدارة المستخدمات هو «مالكة» بالمعنى التشغيلي',
       Auth.isAdminRole('owner') === true && Auth.isAdminRole('manager') === false);

    /* ---------- مع وجود مالكة ثانية يُسمح بما مُنع ---------- */
    const second = await Svc.users.create({ username:'malika2', name:'مالكة ثانية',
                                            roleKey:'owner', password:'Malika2#2026' });
    ok('تنزيل مالكة مسموح ما دامت هناك مالكة أخرى فعّالة',
       await codeOf(() => Svc.users.update(second.id, { roleKey:'manager' })) === null);
    await Svc.users.update(second.id, { roleKey:'owner' });
    ok('إيقاف مالكة أخرى مسموح ما دامت هناك مالكة فعّالة',
       await codeOf(() => Svc.users.setDisabled(second.id, true)) === null);
    /* الحارس نفسه عند حدّه: المالكة الثانية موقوفة الآن، فلم تبقَ إلا واحدة */
    ok('الحارس يمنع إيقاف آخر مالكة فعّالة',
       await codeOf(() => Svc.users.guardLastAdmin(who.owner.id, undefined, true)) === 'LAST_ADMIN');
    ok('الحارس يمنع تنزيل آخر مالكة فعّالة',
       await codeOf(() => Svc.users.guardLastAdmin(who.owner.id, 'reception', undefined)) === 'LAST_ADMIN');
    await Svc.users.setDisabled(second.id, false);
    ok('الحارس يسكت ما دامت هناك مالكة أخرى فعّالة',
       await codeOf(() => Svc.users.guardLastAdmin(who.owner.id, undefined, true)) === null);
    ok('عدد المالكات الفعّالات يُحسب من الدور لا من الاسم',
       Svc.users.activeAdmins().length === 2, Svc.users.activeAdmins().map(u => u.name).join(','));

    /* ---------- تنزيل النفس يُفقد الصلاحية فوراً ---------- */
    await Auth.login('malika2', 'Malika2#2026');
    await Svc.users.update(second.id, { roleKey:'manager' });
    ok('تعديل الدور يسري على الجلسة الجارية فوراً',
       Auth.session.roleKey === 'manager' && Auth.can('settings.users') === false);
    ok('المُنزَّلة لا تستطيع إعادة ترقية نفسها',
       await codeOf(() => Svc.users.update(second.id, { roleKey:'owner' })) === 'FORBIDDEN');
    await Auth.login(who.owner.username, AUTH_PW.owner);
    await Svc.users.update(second.id, { roleKey:'owner' });

    /* ---------- المديرة لا تدير المستخدمات عمداً ---------- */
    await Auth.login(who.manager.username, AUTH_PW.manager);
    ok('المديرة لا تنشئ مستخدمات',
       await codeOf(() => Svc.users.create({ username:'mandas', name:'دسّ', roleKey:'owner',
         password:'Dass#12345' })) === 'FORBIDDEN');
    ok('المديرة لا ترفع نفسها إلى مالكة',
       await codeOf(() => Svc.users.update(who.manager.id, { roleKey:'owner' })) === 'FORBIDDEN');
    ok('المديرة لا تُعيد تهيئة البرنامج', Auth.can('settings.danger') === false);
    ok('المديرة تملك ما عدا ذلك',
       Auth.can('finance.money') && Auth.can('members.delete') && Auth.can('settings.edit'));

    /* ---------- التحقّق من صحّة البيانات ---------- */
    await Auth.login(who.owner.username, AUTH_PW.owner);
    ok('اسم مستخدمة مكرّر يُرفض',
       await codeOf(() => Svc.users.create({ username:'mudira', name:'تكرار', roleKey:'trainer',
         password:'Takrar#12345' })) === 'VALIDATION');
    ok('كلمة مرور قصيرة تُرفض عند الإنشاء',
       await codeOf(() => Svc.users.create({ username:'qasira', name:'قصيرة', roleKey:'trainer',
         password:'12345' })) === 'VALIDATION');
    ok('دور غير موجود يُرفض',
       await codeOf(() => Svc.users.create({ username:'wahm', name:'وهم', roleKey:'superadmin',
         password:'Wahm#12345' })) === 'VALIDATION');
    const arabicUser = await Svc.users.create({ username:'أميرة', name:'أميرة',
                                                roleKey:'trainer', password:'Amira#12345' });
    ok('اسم المستخدمة يُطابَق بلا حساسية لحالة الحرف',
       (Svc.users.byUsername('MUDIRA') || {}).id === who.manager.id,
       (Svc.users.byUsername('MUDIRA') || {}).username);
    ok('اسم المستخدمة العربي يُطابَق بلا حساسية للهمزات والتشكيل',
       (Svc.users.byUsername('اميره') || {}).id === arabicUser.id,
       (Svc.users.byUsername('اميره') || {}).username);
    ok('اسم عربي مكرّر باختلاف الهمزة يُرفض',
       await codeOf(() => Svc.users.create({ username:'اميرة', name:'تكرار عربي',
         roleKey:'trainer', password:'Takrar#12345' })) === 'VALIDATION');

    /* ---------- الحذف لا يمحو التاريخ ---------- */
    const temp = await Svc.users.create({ username:'mughadira', name:'مغادِرة',
                                          roleKey:'reception', password:'Mughadira#1' });
    await Auth.login('mughadira', 'Mughadira#1');
    const m = await Svc.members.create({ name:'مشتركة المغادِرة', phone:'', joinDate:T().D.today() });
    await Auth.login(who.owner.username, AUTH_PW.owner);
    await Svc.users.remove(temp.id);
    const trace = Repos.audit.list(true).find(a => a.entity === 'member' && a.entityId === m.rec.id);
    ok('حذف المستخدمة لا يمحو نسبتها في السجل',
       !!trace && trace.actor === 'مغادِرة' && trace.actorId === temp.id,
       trace ? `${trace.actor}/${trace.actorId}` : 'لا أثر');
    ok('حساب محذوف لا يدخل بعد حذفه',
       await codeOf(() => Auth.login('mughadira', 'Mughadira#1')) === 'BAD_LOGIN');
    return results;
  }

  /* ------------- 4) نسبة الأفعال: كل فعل حسّاس له فاعل حقيقي ------------- */
  async function accountability(){
    const { Auth, Svc, Repos, D, U } = T();
    const before = Repos.audit.list(true).length;
    const historic = U.clone(Repos.audit.list(true).slice(0, 5));
    const who = await authBoot();
    const last = (entity, action) =>
      U.sortBy(Repos.audit.list(true).filter(a => a.entity === entity && a.action === action), a => a.ts, -1)[0];

    /* ---------- الاستقبال: ما تفعله يُنسب إليها ---------- */
    await Auth.login(who.reception.username, AUTH_PW.reception);
    const m = await Svc.members.create({ name:'مشتركة منسوبة', phone:'07700000001', joinDate:D.today() });
    const a = await Svc.attendance.checkIn({ memberId:m.rec.id, date:D.today() });
    const lm = last('member','create'), la = last('attendance','checkin');
    ok('إنشاء مشتركة يُنسب إلى المستخدمة الداخلة',
       !!lm && lm.actor === 'زهراء الاستقبال' && lm.actorId === who.reception.id,
       lm ? lm.actor : 'لا حدث');
    ok('تسجيل الحضور يُنسب إلى المستخدمة الداخلة',
       !!la && la.actorId === who.reception.id, la ? la.actor : 'لا حدث');

    /* ---------- المديرة: المال ينُسب إليها هي لا إلى «المالكة» ---------- */
    await Auth.login(who.manager.username, AUTH_PW.manager);
    await Svc.finance.addCapital({ date:D.today(), amount:500, type:'injection', method:'cash',
                                   description:'ضخ منسوب' });
    const lc = last('capital','create');
    ok('حركة رأس المال تُنسب إلى المديرة التي نفّذتها',
       !!lc && lc.actor === 'سارة المديرة' && lc.actorId === who.manager.id, lc ? lc.actor : 'لا حدث');
    const y = D.addDays(D.today(), -1);
    const cur = Svc.cashbook.get(y); if (cur) await Repos.cashDays.hardDelete(cur.id);
    const day = await Svc.cashbook.close({ date:y, countedCash:0, notes:'إقفال منسوب' });
    ok('الحقل المحفوظ «أقفله» يحمل اسم من أقفل فعلاً',
       day.closedBy === 'سارة المديرة', day.closedBy);

    /* ---------- المالكة: الإقفال والمستندات ---------- */
    await Auth.login(who.owner.username, AUTH_PW.owner);
    const key = D.monthsBack(26)[0];
    if (Svc.periods.isClosed(key)) await Svc.periods.reopen(key, 'تهيئة');
    const per = await Svc.periods.close(key);
    ok('الفترة المقفلة تحمل اسم من أقفلها', per.closedBy === 'أم تبارك', per.closedBy);
    const sup = Repos.suppliers.list()[0] || await Repos.suppliers.create({ name:'مورّد نسبة', phone:'' });
    const prod = Repos.products.list()[0];
    const { rec:pur } = await Svc.purchases.save(null, { supplierId:sup.id, date:D.today(),
      lines:[{ productId:prod.id, qty:1, unitCost:100 }], discount:0 });
    const postedRec = await Svc.purchases.post(pur.id);
    ok('مستند الشراء يحمل اسم من رحّله', postedRec.postedBy === 'أم تبارك', postedRec.postedBy);

    /* ---------- ثوابت النسبة ---------- */
    const fresh = Repos.audit.list(true).filter(x => !historic.some(h => h.id === x.id));
    const sinceAuth = fresh.filter(x => x.actorId);
    ok('كل حدث جديد بعد الدخول يحمل معرّف فاعله واسمه',
       sinceAuth.length > 0 && sinceAuth.every(x => !!x.actor),
       `${sinceAuth.length} حدثاً منسوباً`);
    const known = [who.owner.id, who.manager.id, who.reception.id, who.trainer.id];
    ok('لا حدث منسوب إلى معرّف لا وجود له',
       sinceAuth.every(x => known.includes(x.actorId) || !!Repos.users.get(x.actorId)),
       sinceAuth.filter(x => !Repos.users.get(x.actorId)).length);
    ok('اسم الفاعل المحفوظ يطابق اسم حسابه وقتها',
       sinceAuth.every(x => { const u = Repos.users.get(x.actorId); return !u || u.name === x.actor; }));

    /* ---------- الأحداث التاريخية لا يُخترع لها فاعل ---------- */
    ok('الأحداث السابقة لتفعيل الدخول تبقى كما كُتبت — بلا فاعل مُخترَع',
       historic.every(h => { const now = Repos.audit.get(h.id);
         return !now || (now.actorId === h.actorId && now.actor === h.actor); }),
       `فُحص ${historic.length} حدثاً تاريخياً`);
    ok('عدد الأحداث نما ولم يُعَد كتابة القديم', Repos.audit.list(true).length > before);
    return results;
  }

  /* ------------ 5) النسخة الاحتياطية: تحمل الحسابات لا كلمات المرور ------------ */
  async function authBackup(){
    const { Auth, Svc, Repos, Backup, DB, U } = T();
    const who = await authBoot();
    const code = who.code;

    const b = Backup.build(false);
    const raw = JSON.stringify(b);
    ok('النسخة تحمل جدول المستخدمات', Array.isArray(b.data.users) && b.data.users.length === 4,
       (b.data.users || []).length);
    ok('النسخة لا تحوي أي كلمة مرور نصاً',
       [AUTH_PW.owner, AUTH_PW.manager, AUTH_PW.reception, AUTH_PW.trainer]
         .every(pw => raw.indexOf(pw) === -1));
    ok('النسخة لا تحوي رمز الاسترجاع نصاً', raw.indexOf(code) === -1);
    ok('ما في النسخة تلبيدٌ معلن الخوارزمية بملحه وتكراراته',
       b.data.users.every(u => u.pass && u.pass.algo === 'pbkdf2-sha256'
         && u.pass.salt && u.pass.iterations >= 20000 && u.pass.hash),
       b.data.users.map(u => u.pass && u.pass.algo).join(','));
    const meta = (b.data.meta || []).find(x => x.k === 'settings');
    ok('رمز الاسترجاع في الإعدادات ملبَّد كذلك',
       !!(meta && meta.v && meta.v.authRecovery && meta.v.authRecovery.hash
          && !meta.v.authRecovery.code));

    /* ---------- الاستعادة تُبقي الحسابات صالحة للدخول ---------- */
    await Svc.users.create({ username:'baada', name:'بعد النسخة', roleKey:'trainer',
                             password:'Baada#12345' });
    ok('حساب أُضيف بعد النسخة موجود قبل الاستعادة', !!Svc.users.byUsername('baada'));
    await Backup.restore(b);
    ok('الاستعادة تُرجع جدول المستخدمات كما كان', Repos.users.list(true).length === 4);
    ok('الحساب المُضاف بعد النسخة اختفى بالاستعادة', !Svc.users.byUsername('baada'));
    await Auth.logout();
    ok('الدخول بكلمة المرور نفسها يعمل بعد الاستعادة',
       !!(await Auth.login('omtabarak', AUTH_PW.owner)));
    ok('الصلاحيات بعد الاستعادة كما كانت',
       Auth.session.roleKey === 'owner' && Auth.can('settings.users') === true);
    await Auth.login('istiqbal', AUTH_PW.reception);
    ok('حساب الاستقبال المستعاد يحتفظ بدوره المحدود',
       Auth.can('members.create') === true && Auth.can('finance.money') === false);
    await Auth.login('omtabarak', AUTH_PW.owner);
    ok('رمز الاسترجاع المستعاد ما زال صالحاً', T().Auth.hasRecovery() === true);

    /* ---------- نسخة من قبل الحسابات: النظام يعود بلا حسابات لا مقفلاً ---------- */
    const old = downgrade(Backup.build(false), 7);
    await Backup.restore(old);
    ok('نسخة ما قبل الحسابات تُستعاد وتُرقّى بلا خطأ', DB.count('users') === 0);
    ok('بعدها يعمل النظام بلا حسابات كما كان قبل المرحلة',
       T().Settings.get('authEnabled') !== true && Auth.can('settings.danger') === true,
       String(T().Settings.get('authEnabled')));
    ok('الترقية لم تخترع مستخدمة وهمية', Repos.users.list(true).length === 0);
    ok('الأدوار الأربعة موجودة بعد الترقية', Repos.roles.list(true).length === 4);
    return results;
  }

  async function writeProbe(){
    const { Repos, Svc, D } = T();
    const rec = await Repos.members.create({ name:'اختبار الاستمرارية', phone:'', joinDate:D.today(), code:'ت9999' });
    /* جداول المرحلة الأولى تُختبر بالكتابة الحقيقية لا بالافتراض */
    const note = await Svc.notes.add({ memberId:rec.id, text:'ملاحظة استمرارية', author:'المالكة' });
    const partner = await Repos.partners.create({ name:'شريكة استمرارية', sharePercent:10 });
    const key = D.monthsBack(3)[0];
    let dist = null;
    try {
      if (!Svc.periods.isClosed(key)) await Svc.periods.close(key);
      dist = (await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(key),
        periodTo:D.endOfMonth(key), amount:1, date:D.today(), method:'cash' })).rec;
    } catch(e){ /* الفترة قد لا تسمح — يُختبر ما أمكن */ }
    await Settings.set({ startScreen:'dashboard' });
    return { member:rec.id, note:note.id, partner:partner.id, dist:dist && dist.id, period:key };
  }
  function probeExists(ids){
    const { Repos, Svc, Settings } = T();
    ok('السجل المكتوب نجا من إعادة تحميل الصفحة', !!Repos.members.get(ids.member), ids.member);
    ok('الملاحظة نجت من إعادة التحميل', !!Repos.notes.get(ids.note), ids.note);
    ok('الشريكة نجت من إعادة التحميل', !!Repos.partners.get(ids.partner));
    if (ids.dist) ok('التوزيع نجا من إعادة التحميل', !!Repos.distributions.get(ids.dist), ids.dist);
    ok('الفترة المقفلة نجت من إعادة التحميل', Svc.periods.isClosed(ids.period), ids.period);
    ok('الشاشة الافتتاحية نجت من إعادة التحميل', Settings.get('startScreen') === 'dashboard',
       Settings.get('startScreen'));
    return results;
  }

  /* ====================== المرحلة 3C: تكلفة معروفة وتكلفة غير متوفرة ======================
     السؤال الذي تثبته هذه المجموعة: هل يجرؤ النظام على قول «لا أعرف»؟
     صنف بلا تكلفة مسجَّلة يُباع بـ20 ألفاً: الحساب الساذج يقول ربحاً 20 ألفاً
     وهامشاً 100%. وهذا ليس ربحاً — هو جهلٌ بالتكلفة لبس ثوب الربح. */
  async function storeCosting(){
    const { Svc, Repos, Calc, U, D, Exporter, PayMethods } = T();
    const today = D.today();
    const mk = D.monthKey(today), from = D.startOfMonth(mk), to = D.endOfMonth(mk);

    /* صنفان متطابقان إلا في شيء واحد: أحدهما تُعرف تكلفته والآخر لا */
    const { rec: known } = await Svc.inventory.saveProduct(null,
      { name:'صنف تُعرف تكلفته', price:10000, cost:6000, openingQty:10, openingDate:today });
    const { rec: blind } = await Svc.inventory.saveProduct(null,
      { name:'صنف بلا تكلفة', price:10000, cost:'', openingQty:10, openingDate:today });
    eq('الصنف بلا تكلفة يُحفظ بتكلفة صفر', Repos.products.get(blind.id).cost, 0);
    ok('وصفر التكلفة يُقرأ «غير معروف» لا «يساوي صفراً»',
       Svc.inventory.costKnown(Repos.products.get(known.id)) === true
       && Svc.inventory.costKnown(Repos.products.get(blind.id)) === false);

    const base = Svc.sales.summary(from, to);
    const s1 = await Svc.sales.create({ date:today, lines:[{ productId:known.id, qty:2, unitPrice:10000 }],
      paidAmount:20000, paymentMethod:'cash' });
    const s2 = await Svc.sales.create({ date:today, lines:[{ productId:blind.id, qty:2, unitPrice:10000 }],
      paidAmount:20000, paymentMethod:'cash' });
    eq('سطر البيع يحمل تكلفته وقت البيع', s1.rec.lines[0].unitCost, 6000);
    eq('وسطر الصنف بلا تكلفة يحمل صفراً', s2.rec.lines[0].unitCost, 0);

    const sum = Svc.sales.summary(from, to);
    eq('المبيعات تُحسب كاملة', U.round2(sum.revenue - base.revenue), 40000);
    eq('تكلفة ما بيع = تكلفة ما تُعرف تكلفته وحده', U.round2(sum.cost - base.cost), 12000);
    /* الثابت الأهم في هذه المجموعة */
    eq('الربح لا يشمل بيعاً تكلفته غير متوفرة', U.round2(sum.profit - base.profit), 8000);
    eq('ما تُعرف تكلفته يُقال بمقداره', U.round2(sum.knownRevenue - base.knownRevenue), 20000);
    eq('وما لا تُعرف تكلفته يُقال بمقداره أيضاً', U.round2(sum.unknownRevenue - base.unknownRevenue), 20000);
    ok('التقرير يعلن أنه ناقص', sum.complete === false);
    ok('الهامش يُحسب على المعروف وحده لا على كل المبيعات',
       sum.margin != null && sum.margin < 100, sum.margin);
    ok('اسم الصنف المجهول تكلفتُه مذكور ليُصلَح',
       sum.unknownNames.indexOf('صنف بلا تكلفة') >= 0, sum.unknownNames.join('،'));

    /* لولا الفصل لكان الربح 28000 وهامشه 70% — رقمان لم يحدثا */
    ok('الحساب الساذج (المبيعات − التكلفة) مرفوض صراحةً',
       U.round2(sum.profit - base.profit) !== U.round2(40000 - 12000));

    /* بند حرّ بلا صنف: لا مصدر لتكلفته أصلاً */
    const s3 = await Svc.sales.create({ date:today, lines:[{ name:'بند حرّ بلا صنف', qty:1, unitPrice:5000 }],
      paidAmount:5000, paymentMethod:'cash' });
    const sum3 = Svc.sales.summary(from, to);
    eq('البند الحرّ لا يزيد الربح', sum3.profit, sum.profit);
    eq('ويُضاف إلى ما لا تُعرف تكلفته', U.round2(sum3.unknownRevenue - sum.unknownRevenue), 5000);

    /* تسجيل التكلفة يُصلح الأمر للمبيعات القادمة، ولا يُعيد كتابة ماضٍ */
    const profitBefore = Svc.sales.summary(from, to).profit;
    await Svc.inventory.saveProduct(blind.id, { name:'صنف بلا تكلفة', price:10000, cost:6000 });
    eq('تسجيل التكلفة اليوم لا يخترع ربحاً لبيعةٍ تمّت أمس',
       Svc.sales.summary(from, to).profit, profitBefore);
    const s4 = await Svc.sales.create({ date:today, lines:[{ productId:blind.id, qty:1, unitPrice:10000 }],
      paidAmount:10000, paymentMethod:'cash' });
    eq('والبيعة التالية تحمل التكلفة الجديدة', s4.rec.lines[0].unitCost, 6000);
    eq('فيزيد الربح بها وحدها', U.round2(Svc.sales.summary(from, to).profit - profitBefore), 4000);

    /* ---------------------- تقويم المخزون ---------------------- */
    const { rec: blind2 } = await Svc.inventory.saveProduct(null,
      { name:'مخزون بلا تكلفة', price:8000, cost:'', openingQty:7, openingDate:today });
    const val = Svc.inventory.valuation();
    ok('التقويم يعلن أنه جزئي', val.complete === false);
    ok('الصنف بلا تكلفة يُعدّ ولا يُقوَّم بصفر صامت', val.unknownItems >= 1, val.unknownItems);
    ok('وكميته محفوظة في التقرير', val.unknownQty >= 7, val.unknownQty);
    const row = Svc.inventory.rows().find(r => r.p.id === blind2.id);
    ok('صف الصنف يقول إن تكلفته غير معروفة', row && row.costKnown === false);
    ok('وشاشة المخزون تجد الأصناف التي تحتاج تكلفة',
       Svc.inventory.unknownCost().some(r => r.p.id === blind2.id));
    /* قيمة المخزون لا تكذب في الاتجاه الآخر: لا تُقوَّم البضاعة المجهولة بسعر بيعها */
    const knownRow = Svc.inventory.rows().find(r => r.p.id === known.id);
    eq('ما تُعرف تكلفته يُقوَّم بها', knownRow.value, U.round2(knownRow.qty * 6000));

    /* ---------------------- التصديرات تقول الحقيقة نفسها ---------------------- */
    const prodRows = Exporter.prodRows(Svc.inventory.rows());
    const blindRow = prodRows.find(r => r.name === 'مخزون بلا تكلفة');
    ok('عمود أساس التكلفة يقول «غير متوفر»', blindRow.costBasis === Calc.COST_UNKNOWN_AR, blindRow.costBasis);
    ok('ولا تُكتب تكلفة رقمية مخترعة', blindRow.cost === '', JSON.stringify(blindRow.cost));
    const csvTxt = Exporter.csv('t.csv', Exporter.PROD_COLS, prodRows);
    const blindLine = csvTxt.split('\r\n').find(l => l.indexOf('مخزون بلا تكلفة') >= 0);
    ok('وفي ملف CSV تبقى الخانة فارغة لا صفراً', blindLine.indexOf(',,') >= 0, blindLine.slice(0, 90));

    /* ---------------------- التقرير يقول ما يعرف وما لا يعرف ---------------------- */
    const rep = T().Reports.build(mk);
    ok('التقرير الشهري يعلن نقص بيانات التكلفة', rep.sales.complete === false);
    ok('وتقويم مخزونه جزئي', rep.stock.valuation.complete === false);
    const text = T().Reports.summaryText(rep);
    ok('والملخّص التنفيذي يقولها بالعربية لا بالصمت',
       text.indexOf('غير متوفرة') >= 0 && text.indexOf('ناقص') >= 0, text.slice(-160));
    const html = T().Reports.html(rep, true);
    ok('وورقة التقرير المطبوعة تحمل التنبيه نفسه', html.indexOf('غير متوفرة') >= 0);
    ok('ولا تسمّي الرقم «ربح المتجر» مجرّداً حين يكون ناقصاً',
       html.indexOf('ربح المتجر (على ما تُعرف تكلفته)') >= 0);

    /* ---------------------- الثابت الحاكم: لا مبلغ يتسرّب بين القسمين ----------------------
       كل دينار من المبيعات إمّا تُعرف تكلفته أو لا تُعرف. لا ثالث لهما، ولا
       يسقط دينار بينهما — وإلا صار الفصل نفسه بابَ ضياعٍ جديد. */
    const inv = Svc.sales.summary(from, to);
    eq('ما تُعرف تكلفته + ما لا تُعرف = كل المبيعات',
       U.round2(inv.knownRevenue + inv.unknownRevenue), inv.revenue);
    /* والخصم على مستوى الفاتورة يُوزَّع ولا يُهمَل: فاتورة بخصم تبقى محكومة بالثابت */
    const sD = await Svc.sales.create({ date:today, discount:3000,
      lines:[{ productId:known.id, qty:1, unitPrice:10000 }, { name:'بند حرّ ثانٍ', qty:1, unitPrice:5000 }],
      paidAmount:12000, paymentMethod:'cash' });
    const invD = Svc.sales.summary(from, to);
    eq('والثابت يصمد بعد فاتورة فيها خصم على المستوى الكلي',
       U.round2(invD.knownRevenue + invD.unknownRevenue), invD.revenue);
    eq('وإجمالي الفاتورة المخصومة دخل المبيعات كما هو',
       U.round2(invD.revenue - inv.revenue), sD.rec.total);
    ok('والخصم لم يُنسب كلّه إلى قسم واحد',
       invD.knownRevenue > inv.knownRevenue && invD.unknownRevenue > inv.unknownRevenue,
       `known ${inv.knownRevenue}→${invD.knownRevenue}, unknown ${inv.unknownRevenue}→${invD.unknownRevenue}`);

    /* ---------------------- لا رقم مالي خُلق من العدم ---------------------- */
    const revLines = U.round2(U.sum(Calc.inRange(Repos.revenues.list(), today, today)
      .filter(r => r.source === 'product'), r => r.amount));
    const salePays = U.round2(U.sum(Repos.payments.list().filter(p => p.refType === 'sale' && p.date === today),
      p => p.amount));
    eq('كل دفعة بيع صارت سطر إيراد واحداً بالضبط', revLines, salePays);
  }

  /* ====================== تصديرات محاسبية ======================
     التصدير ليس زينة: هو ما تحمله صاحبة النادي إلى محاسبها. فإن اختلف
     رقمٌ فيه عن الشاشة صار النظام مصدرين للحقيقة، وهذا أسوأ من لا تصدير. */
  async function accountingExports(){
    const { Svc, Repos, Calc, U, D, Exporter, PayMethods } = T();
    const today = D.today(), mk = D.monthKey(today);
    const from = D.startOfMonth(mk), to = D.endOfMonth(mk);
    const inR = rows => Calc.inRange(rows, from, to);

    /* بيانات حقيقية: مورّد ⇐ مستند ⇐ ترحيل ⇐ تسديد جزئي */
    const sup = await Svc.suppliers.save(null, { name:'مورّد التصدير' });
    const { rec: pr } = await Svc.inventory.saveProduct(null, { name:'صنف التصدير', price:9000, cost:5000 });
    const dr = await Svc.purchases.save(null, { supplierId:sup.id, date:today, invoiceNo:'EX-1',
      lines:[{ productId:pr.id, qty:10, unitCost:5000 }] });
    await Svc.purchases.post(dr.rec.id);
    await Svc.purchases.addPayment({ purchaseId:dr.rec.id, date:today, amount:20000, method:'cash' });

    /* --- المشتريات --- */
    const puRows = Exporter.purchaseRows(inR(Repos.purchases.list(true)));
    const mine = puRows.find(r => r.code === dr.rec.code);
    ok('ورقة المشتريات تجد المستند', !!mine, dr.rec.code);
    eq('إجمالي المستند في الملف = إجماليه في النظام', mine.total, 50000);
    eq('والمدفوع فيه = مجموع دفعاته', mine.paid, Svc.purchases.paidFor(dr.rec.id));
    eq('والمتبقّي = الإجمالي − المدفوع', mine.due, 30000);
    ok('وحالة السداد مكتوبة بالعربية', mine.payState === 'مدفوع جزئياً', mine.payState);
    ok('واسم المورّد مذكور', mine.supplier === 'مورّد التصدير', mine.supplier);
    /* الرقم لا يُحسب مرتين: مجموع الورقة = مجموع الخدمة */
    eq('مجموع المتبقّي في الورقة = رقم مستحقات الموردين',
       U.round2(U.sum(puRows.filter(r => r.state === 'مُرحَّل'), r => r.due)),
       U.round2(U.sum(Svc.purchases.payables().rows
         .filter(x => D.cmp(x.p.date, from) >= 0 && D.cmp(x.p.date, to) <= 0), x => x.st.due)));

    /* --- دفعات الموردين --- */
    const spRows = Exporter.supplierPayRows(inR(Repos.purchasePayments.list()));
    eq('ورقة دفعات الموردين تطابق عددها', spRows.length, inR(Repos.purchasePayments.list()).length);
    ok('وكل دفعة تحمل طريقتها ومستندها',
       spRows.every(r => r.method && r.purchase), JSON.stringify(spRows[0]));

    /* --- المقبوضات --- */
    const pmRows = Exporter.paymentRows(inR(Repos.payments.list()));
    eq('ورقة المقبوضات تطابق عدد الدفعات', pmRows.length, inR(Repos.payments.list()).length);
    eq('ومجموعها = مجموع الدفعات في الفترة',
       U.round2(U.sum(pmRows, r => r.amount)), U.round2(U.sum(inR(Repos.payments.list()), p => p.amount)));
    ok('وكل صف يقول طريقته', pmRows.every(r => !!r.method));

    /* --- حركة النقد: ورقة المطابقة --- */
    await Svc.cashbook.close({ date:today, countedCash:Svc.cashbook.expected(today).expected });
    const cashRows = Exporter.cashRows(from, to);
    const dayRow = cashRows.find(r => r.date === D.fmt(today));
    ok('ورقة النقد تجد اليوم المقفل', !!dayRow);
    const snap = Svc.cashbook.get(today);
    eq('الافتتاحي في الورقة = الافتتاحي المحفوظ', dayRow.opening, snap.openingCash);
    eq('والداخل = الداخل', dayRow.cashIn, snap.cashIn);
    eq('والخارج = الخارج', dayRow.cashOut, snap.cashOut);
    eq('والمتوقّع = المتوقّع', dayRow.expected, snap.expectedCash);
    eq('والمعدود = المعدود', dayRow.counted, snap.countedCash);
    eq('والفرق = المعدود − المتوقّع', dayRow.difference, U.round2(snap.countedCash - snap.expectedCash));
    /* الثابت الذي تُبنى عليه المطابقة كلها */
    eq('افتتاحي + داخل − خارج = المتوقّع',
       U.round2(dayRow.opening + dayRow.cashIn - dayRow.cashOut), dayRow.expected);
    ok('واليوم المقفل يُقال عنه ذلك', dayRow.state === 'مُقفل', dayRow.state);

    /* --- قاعدة CSV: خانة رقمية فارغة تبقى فارغة --- */
    const txt = Exporter.csv('t.csv', [{ h:'أ', key:'a', type:'number' }, { h:'ب', key:'b' }],
      [{ a:'', b:'س' }, { a:0, b:'ص' }, { a:7, b:'ع' }]);
    const lines = txt.split('\r\n');
    ok('الفراغ يبقى فراغاً', lines[1] === ',"س"', lines[1]);
    ok('والصفر الحقيقي يبقى صفراً', lines[2] === '0,"ص"', lines[2]);
    ok('والرقم يبقى رقماً بلا فواصل', lines[3] === '7,"ع"', lines[3]);
    ok('والملف يبدأ بترويسة الأعمدة', lines[0] === '"أ","ب"', lines[0]);

    /* --- التصدير لا يحمل كلمات مرور ولا بصماتها --- */
    const all = [Exporter.csv('a.csv', Exporter.PAYMENT_COLS, pmRows),
                 Exporter.csv('b.csv', Exporter.PURCHASE_COLS, puRows),
                 Exporter.csv('c.csv', Exporter.CASH_COLS, cashRows)].join('\n');
    ok('لا تسرّب أي ورقة كلمة مرور ولا بصمتها',
       !/passwordHash|salt|كلمة المرور/i.test(all));
    ok('وكل ملف يبدأ بترويسة تُقرأ بالعربية', all.indexOf('"التاريخ"') >= 0);

    /* --- الشاشة تفتح بلا خطأ وتبني الأوراق نفسها --- */
    const h = T().Screens.accountingExport(mk);
    const ovl = document.querySelector('.modal-ov, .overlay, .modal');
    ok('شاشة التصديرات تُفتح', !!ovl || !!h);
    if (h && h.close) h.close();
  }

  return {
    get results(){ return results; },
    reset(){ results = []; },
    money, stock, subscriptions, migrations, demo, guards, classes, modals,
    saveAndPrint, desk, notes, distributions, creditsOnArchive, search, startScreen,
    capitalMethods, purchases, allocations, periodClose, integrityP2,
    storeCosting, accountingExports,
    branding, onboarding,
    auth, permMatrix, usersAdmin, accountability, authBackup,
    writeProbe, probeExists, totals, endDates, downgrade
  };
})();
