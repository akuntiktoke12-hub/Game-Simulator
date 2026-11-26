(() => {
  const $ = (id) => document.getElementById(id);
  const USD_TO_IDR = 16000;
  const SUPABASE_URL = 'https://giprrjogyrqmprkazmjj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hoOXAh0FK-AEwwWZs36VHg_jdJIslNk';
  const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  let cloudUser = null;
  let cloudReady = false;
  let loadingUserId = null;
  let cloudSaveTimer;
  let signUpMode = false;
  const LEVERAGES = [100, 200, 500, 1000, 2000];
  const PAIRS = {
    XAUUSD: { label: 'Gold / US Dollar', symbol: 'OANDA:XAUUSD', start: 2350, step: 2.4, contract: 100, type: 'metal' },
    EURUSD: { label: 'Euro / US Dollar', symbol: 'OANDA:EURUSD', start: 1.085, step: 0.0008, contract: 100000, type: 'usd-quote' },
    GBPUSD: { label: 'British Pound / US Dollar', symbol: 'OANDA:GBPUSD', start: 1.270, step: 0.001, contract: 100000, type: 'usd-quote' },
    USDJPY: { label: 'US Dollar / Japanese Yen', symbol: 'OANDA:USDJPY', start: 150, step: 0.08, contract: 100000, type: 'usd-base' },
    USDCHF: { label: 'US Dollar / Swiss Franc', symbol: 'OANDA:USDCHF', start: 0.88, step: 0.0007, contract: 100000, type: 'usd-base' },
    USDCAD: { label: 'US Dollar / Canadian Dollar', symbol: 'OANDA:USDCAD', start: 1.35, step: 0.0008, contract: 100000, type: 'usd-base' },
    AUDUSD: { label: 'Australian Dollar / US Dollar', symbol: 'OANDA:AUDUSD', start: 0.655, step: 0.0007, contract: 100000, type: 'usd-quote' },
    NZDUSD: { label: 'New Zealand Dollar / US Dollar', symbol: 'OANDA:NZDUSD', start: 0.61, step: 0.0007, contract: 100000, type: 'usd-quote' },
    XAGUSD: { label: 'Silver / US Dollar', symbol: 'OANDA:XAGUSD', start: 28.5, step: 0.08, contract: 5000, type: 'metal' }
  };
  const money = (value) => 'Rp' + Math.round(Number(value) || 0).toLocaleString('id-ID');
  const fmtPrice = (value, pair) => Number(value).toLocaleString('en-US', {
    minimumFractionDigits: pair === 'XAUUSD' || pair === 'XAGUSD' ? 2 : 5,
    maximumFractionDigits: pair === 'XAUUSD' || pair === 'XAGUSD' ? 2 : 5
  });
  const saved = (() => { try { return JSON.parse(localStorage.getItem('traderSimulatorDemo')); } catch { return null; } })();
  let positions = Array.isArray(saved?.positions) ? saved.positions.filter((position) => PAIRS[position.pair]) : [];
  let balance = Number.isFinite(saved?.balance) ? saved.balance : 0;
  if (saved?.accountingVersion !== 2) {
    balance += positions.reduce((sum, position) => sum + (Number(position.margin) || 0), 0);
  }
  let totalPL = Number.isFinite(saved?.totalPL) ? saved.totalPL : 0;
  const prices = Object.fromEntries(Object.entries(PAIRS).map(([pair, config]) => [pair, Number.isFinite(saved?.prices?.[pair]) ? saved.prices[pair] : config.start]));
  const previousPrices = { ...prices };
  let selectedPair = PAIRS[saved?.selectedPair] ? saved.selectedPair : 'XAUUSD';
  let leverage = LEVERAGES.includes(saved?.leverage) ? saved.leverage : 100;
  let history = Array.isArray(saved?.history) ? saved.history.filter((item) => PAIRS[item.pair]) : [];
  const BUSINESSES = [
    { id: 'warung-madura', name: 'Warung Madura', capital: 5000000, dailyIncome: 250000, description: 'Warung kebutuhan harian yang buka sepanjang waktu.' },
    { id: 'warkop', name: 'Warkop', capital: 10000000, dailyIncome: 450000, description: 'Warung kopi sederhana untuk pelanggan sekitar.' },
    { id: 'laundry', name: 'Laundry', capital: 25000000, dailyIncome: 800000, description: 'Layanan cuci dan setrika pakaian.' },
    { id: 'cafe', name: 'Cafe', capital: 50000000, dailyIncome: 1500000, description: 'Tempat nongkrong dengan menu makanan dan minuman.' },
    { id: 'small-company', name: 'Perusahaan Kecil', capital: 100000000, dailyIncome: 3000000, description: 'Usaha skala kecil dengan operasional yang lebih luas.' },
    { id: 'large-company', name: 'Perusahaan Besar', capital: 500000000, dailyIncome: 12000000, description: 'Perusahaan skala besar dengan potensi hasil lebih tinggi.' }
  ];
  const savedBusiness = (() => { try { return JSON.parse(localStorage.getItem('traderSimulatorBusiness')); } catch { return null; } })();
  let mainBalance = Number.isFinite(savedBusiness?.mainBalance) ? savedBusiness.mainBalance : 10000000;
  if (savedBusiness && savedBusiness.sharedBalanceVersion !== 1 && Number.isFinite(savedBusiness.balance)) balance += savedBusiness.balance;
  let businessDays = Number.isFinite(savedBusiness?.days) ? savedBusiness.days : 0;
  let ownedBusinesses = Array.isArray(savedBusiness?.owned) ? savedBusiness.owned.filter((id) => BUSINESSES.some((business) => business.id === id)) : [];
  let lastGameTick = Number.isFinite(savedBusiness?.lastGameTick) ? savedBusiness.lastGameTick : Date.now();
  let accountStopped = false;
  let toastTimer;

  function currentPrice(pair) { return prices[pair]; }
  function pnl(position) {
    const config = PAIRS[position.pair];
    const difference = currentPrice(position.pair) - position.open;
    const direction = position.side === 'buy' ? 1 : -1;
    const quoteToUSD = config.type === 'usd-base' ? 1 / currentPrice(position.pair) : 1;
    return difference * config.contract * position.lot * direction * quoteToUSD * USD_TO_IDR;
  }
  function marginFor(pair, lot, selectedLeverage = leverage) {
    const config = PAIRS[pair];
    const notionalUSD = config.type === 'metal' ? currentPrice(pair) * config.contract * lot : (config.type === 'usd-base' ? config.contract * lot : currentPrice(pair) * config.contract * lot);
    return notionalUSD * USD_TO_IDR / selectedLeverage;
  }
  function usedMargin() { return positions.reduce((sum, position) => sum + position.margin, 0); }
  function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function persist() {
    try { localStorage.setItem('traderSimulatorDemo', JSON.stringify({ accountingVersion: 2, balance, totalPL, prices, selectedPair, leverage, positions, history: history.slice(0, 30) })); } catch {}
    queueCloudSave();
  }
  function persistBusiness() {
    try { localStorage.setItem('traderSimulatorBusiness', JSON.stringify({ sharedBalanceVersion: 1, walletVersion: 1, mainBalance, days: businessDays, owned: ownedBusinesses, lastGameTick })); } catch {}
    queueCloudSave();
  }
  function cloudSnapshot() {
    return {
      trading: { accountingVersion: 2, balance, totalPL, prices, selectedPair, leverage, positions, history: history.slice(0, 30) },
      business: { sharedBalanceVersion: 1, mainBalance, days: businessDays, owned: ownedBusinesses, lastGameTick }
    };
  }
  function queueCloudSave() {
    if (!supabase || !cloudUser || !cloudReady) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(async () => {
      const { error } = await supabase.from('game_saves').upsert({
        user_id: cloudUser.id,
        save_data: cloudSnapshot(),
        updated_at: new Date().toISOString()
      });
      if (error) console.error('Gagal menyimpan progres ke Supabase:', error.message);
    }, 500);
  }
  function applyCloudSnapshot(data) {
    const trading = data?.trading || {};
    const business = data?.business || {};
    if (Number.isFinite(trading.balance)) balance = trading.balance;
    if (Number.isFinite(trading.totalPL)) totalPL = trading.totalPL;
    if (trading.prices && typeof trading.prices === 'object') {
      Object.entries(PAIRS).forEach(([pair, config]) => {
        prices[pair] = Number.isFinite(trading.prices[pair]) ? trading.prices[pair] : config.start;
        previousPrices[pair] = prices[pair];
      });
    }
    if (PAIRS[trading.selectedPair]) selectedPair = trading.selectedPair;
    if (LEVERAGES.includes(trading.leverage)) leverage = trading.leverage;
    if (Array.isArray(trading.positions)) positions = trading.positions.filter((position) => PAIRS[position.pair]);
    if (Array.isArray(trading.history)) history = trading.history.filter((item) => PAIRS[item.pair]).slice(0, 30);
    if (Number.isFinite(business.mainBalance)) mainBalance = business.mainBalance;
    if (Number.isFinite(business.days)) businessDays = business.days;
    if (Array.isArray(business.owned)) ownedBusinesses = business.owned.filter((id) => BUSINESSES.some((item) => item.id === id));
    if (Number.isFinite(business.lastGameTick)) lastGameTick = business.lastGameTick;
    accountStopped = false;
    $('pairSelect').value = selectedPair;
    $('leverage').value = String(leverage);
  }
  async function handleAuthSession(session) {
    const authModal = $('authModal');
    if (!session) {
      clearTimeout(cloudSaveTimer);
      cloudUser = null;
      cloudReady = false;
      $('authUser').hidden = true;
      if (!authModal.open) authModal.showModal();
      return;
    }
    if (cloudUser?.id === session.user.id && cloudReady) return;
    if (loadingUserId === session.user.id) return;
    loadingUserId = session.user.id;
    cloudUser = session.user;
    cloudReady = false;
    $('userEmail').textContent = session.user.email || 'Pemain';
    $('authUser').hidden = false;
    $('authMessage').textContent = 'Memuat progres pemain…';
    const { data, error } = await supabase.from('game_saves').select('save_data').eq('user_id', session.user.id).maybeSingle();
    loadingUserId = null;
    if (error) {
      $('authMessage').textContent = `Gagal memuat data: ${error.message}`;
      console.error('Gagal memuat progres dari Supabase:', error.message);
      return;
    }
    if (data?.save_data) applyCloudSnapshot(data.save_data);
    cloudReady = true;
    authModal.close();
    renderChart(selectedPair);
    render();
    renderBusiness();
    updateGameClock();
    if (!data) queueCloudSave();
  }
  function renderBusiness() {
    $('businessBalance').textContent = money(mainBalance);
    $('investmentBalance').textContent = money(mainBalance);
    $('businessCatalog').innerHTML = BUSINESSES.map((business, index) => `<article class="panel business-card"><span>${String(index + 1).padStart(2, '0')}</span><h2>${business.name}</h2><p>${business.description}</p><p class="business-cost">Modal awal: <strong>${money(business.capital)}</strong></p><p class="business-income">Pendapatan bersih: ${money(business.dailyIncome)} / hari</p><button class="button button-buy" type="button" data-buy-business="${business.id}">Buka bisnis</button></article>`).join('');
    const totals = BUSINESSES.map((business) => ({ ...business, count: ownedBusinesses.filter((id) => id === business.id).length })).filter((business) => business.count);
    $('ownedBusinessCount').textContent = `${ownedBusinesses.length} usaha`;
    $('ownedBusinessesBody').innerHTML = totals.length ? totals.map((business) => `<tr><td>${business.name}</td><td>${business.count}</td><td>${money(business.capital)}</td><td class="positive">${money(business.dailyIncome * business.count)}</td></tr>`).join('') : '<tr class="empty-row"><td colspan="4">Belum memiliki bisnis. Pilih usaha untuk memulai.</td></tr>';
  }
  function buyBusiness(id) {
    const business = BUSINESSES.find((item) => item.id === id);
    if (!business) return;
    if (mainBalance < business.capital) { notify(`Saldo utama belum cukup untuk membuka ${business.name}.`); return; }
    mainBalance -= business.capital;
    ownedBusinesses.push(business.id);
    persist();
    persistBusiness();
    render();
    renderBusiness();
    notify(`${business.name} berhasil dibuka!`);
  }
  function updateGameClock() {
    const now = Date.now();
    const elapsed = Math.max(0, now - lastGameTick);
    const completedDays = Math.floor(elapsed / 60000);
    if (completedDays > 0) {
      lastGameTick += completedDays * 60000;
      businessDays += completedDays;
      const dailyIncome = ownedBusinesses.reduce((sum, id) => sum + BUSINESSES.find((business) => business.id === id).dailyIncome, 0);
      if (dailyIncome > 0) {
        mainBalance += dailyIncome * completedDays;
        notify(`${completedDays} hari game berlalu · pendapatan bisnis ${money(dailyIncome * completedDays)}.`);
      }
      persist();
      persistBusiness();
      render();
      renderBusiness();
    }
    const currentElapsed = Math.max(0, Date.now() - lastGameTick);
    const gameMinutes = Math.floor((currentElapsed % 60000) / 60000 * 1440);
    const hours = String(Math.floor(gameMinutes / 60)).padStart(2, '0');
    const minutes = String(gameMinutes % 60).padStart(2, '0');
    const gameDay = businessDays % 30 + 1;
    const gameMonth = Math.floor(businessDays / 30) % 12 + 1;
    const gameYear = Math.floor(businessDays / 360) + 1;
    $('gameDate').textContent = `Tahun ${gameYear} · Bulan ${gameMonth} · Hari ${gameDay}`;
    $('gameTime').textContent = `${hours}:${minutes}`;
  }
  function renderChart(pair) {
    const root = $('chartWidget');
    root.replaceChildren();
    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    const fallback = document.createElement('div');
    fallback.className = 'chart-fallback';
    fallback.textContent = 'Chart TradingView memerlukan koneksi internet.';
    root.append(widget, fallback);
    const observer = new MutationObserver(() => {
      if (widget.querySelector('iframe')) {
        fallback.hidden = true;
        observer.disconnect();
      }
    });
    observer.observe(widget, { childList: true, subtree: true });
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true, symbol: PAIRS[pair].symbol, interval: '15', timezone: 'Etc/UTC',
      theme: 'dark', style: '1', locale: 'id', withdateranges: true,
      hide_side_toolbar: false, allow_symbol_change: false, save_image: false,
      enabled_features: ['mouse_wheel_scale', 'chart_zoom'],
      calendar: false, support_host: 'https://www.tradingview.com'
    });
    root.appendChild(script);
  }
  function render() {
    const floating = positions.reduce((sum, position) => sum + pnl(position), 0);
    const equity = balance + floating;
    const totalEquity = mainBalance + equity;
    $('balance').textContent = money(Math.max(0, balance));
    $('equity').textContent = money(Math.max(0, equity));
    $('homeBalance').textContent = money(Math.max(0, mainBalance));
    $('homeEquity').textContent = money(Math.max(0, totalEquity));
    $('homeFloating').textContent = money(floating);
    $('homeFloating').className = floating >= 0 ? 'positive' : 'negative';
    $('modalBalance').textContent = money(Math.max(0, mainBalance));
    $('modalTradingBalance').textContent = money(Math.max(0, balance));
    $('modalFloating').textContent = money(floating);
    $('modalFloating').className = floating >= 0 ? 'positive' : 'negative';
    $('modalEquity').textContent = money(Math.max(0, totalEquity));
    $('floating').textContent = money(floating);
    $('floating').className = floating >= 0 ? 'positive' : 'negative';
    $('totalPL').textContent = money(totalPL);
    $('totalPL').className = totalPL >= 0 ? 'positive' : 'negative';
    $('simPrice').textContent = fmtPrice(currentPrice(selectedPair), selectedPair);
    $('pricePair').textContent = selectedPair;
    const change = currentPrice(selectedPair) - previousPrices[selectedPair];
    const percent = previousPrices[selectedPair] ? change / previousPrices[selectedPair] * 100 : 0;
    $('priceChange').textContent = `${change >= 0 ? '+' : ''}${fmtPrice(change, selectedPair)} (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)`;
    $('priceChange').className = 'price-change ' + (change >= 0 ? 'positive' : 'negative');
    $('usedMargin').textContent = money(usedMargin());
    $('leverageLabel').textContent = `1:${leverage}`;
    $('margin').textContent = money(marginFor(selectedPair, Math.max(0, Number($('lots').value) || 0)));
    $('positionCount').textContent = `${positions.length} posisi`;

    $('positionsBody').innerHTML = positions.length ? positions.map((position) => {
      const profit = pnl(position);
      const pairPrice = currentPrice(position.pair);
      return `<tr><td>${position.pair}</td><td class="side-${position.side}">${position.side.toUpperCase()}</td><td>${position.lot.toFixed(2)}</td><td>${fmtPrice(position.open, position.pair)}</td><td>${fmtPrice(pairPrice, position.pair)}</td><td>${position.sl ? fmtPrice(position.sl, position.pair) : '—'} / ${position.tp ? fmtPrice(position.tp, position.pair) : '—'}</td><td class="${profit >= 0 ? 'positive' : 'negative'}">${money(profit)}</td><td><button class="close-button" data-close="${position.id}" type="button">Tutup</button></td></tr>`;
    }).join('') : '<tr class="empty-row"><td colspan="8">Belum ada posisi terbuka. Buat transaksi demo untuk mulai.</td></tr>';

    $('historyBody').innerHTML = history.length ? history.slice(0, 30).map((item) => `<tr><td>${item.pair}</td><td class="side-${item.side}">${item.side.toUpperCase()}</td><td>${item.lot.toFixed(2)}</td><td>${fmtPrice(item.open, item.pair)}</td><td>${fmtPrice(item.close, item.pair)}</td><td>${item.reason}</td><td class="${item.profit >= 0 ? 'positive' : 'negative'}">${money(item.profit)}</td></tr>`).join('') : '<tr class="empty-row"><td colspan="7">Riwayat transaksi masih kosong.</td></tr>';
    persist();
  }
  function transactFunds(action) {
    const input = $('fundAmount');
    const amount = Number(input.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Masukkan jumlah yang valid dan lebih besar dari Rp0.');
      return;
    }
    if (action === 'deposit') {
      if (amount > mainBalance) {
        notify(`Deposit melebihi saldo utama. Maksimal ${money(mainBalance)}.`);
        return;
      }
      mainBalance -= amount;
      balance += amount;
      notify(`Deposit ke Trading berhasil: ${money(amount)}.`);
    } else {
      const available = Math.max(0, balance - usedMargin());
      if (amount > available) {
        notify(`Withdrawal melebihi saldo Trading bebas. Maksimal ${money(available)}.`);
        return;
      }
      balance -= amount;
      mainBalance += amount;
      notify(`Withdrawal ke saldo utama berhasil: ${money(amount)}.`);
    }
    persist();
    persistBusiness();
    render();
    renderBusiness();
  }

  function stopOutIfNeeded() {
    const equity = balance + positions.reduce((sum, position) => sum + pnl(position), 0);
    if (equity > 0) return false;
    if (accountStopped) return true;

    positions.splice(0).forEach((position) => {
      const profit = pnl(position);
      totalPL += profit;
      history.unshift({ ...position, close: currentPrice(position.pair), profit, reason: 'stop out' });
    });
    balance = 0;
    accountStopped = true;
    render();
    notify('STOP OUT — equity mencapai Rp0. Akun selesai. Reset akun untuk bermain lagi.');
    return true;
  }
  function closePosition(id, reason = 'manual') {
    const index = positions.findIndex((position) => String(position.id) === String(id));
    if (index < 0) return;
    const [position] = positions.splice(index, 1);
    const profit = pnl(position);
    balance = Math.max(0, balance + profit);
    totalPL += profit;
    history.unshift({ ...position, close: currentPrice(position.pair), profit, reason });
    if (stopOutIfNeeded()) return;
    render();
    if (reason === 'manual') notify(`Posisi ${position.pair} ditutup: ${money(profit)}`);
  }
  function closeAllPositions() {
    if (!positions.length) { notify('Tidak ada posisi terbuka untuk ditutup.'); return; }
    const closedPositions = positions.splice(0);
    const closedAt = Date.now();
    const totalProfit = closedPositions.reduce((sum, position) => sum + pnl(position), 0);
    closedPositions.forEach((position, index) => {
      const profit = pnl(position);
      history.unshift({ ...position, close: currentPrice(position.pair), profit, reason: 'close all', closedAt: closedAt + index });
    });
    balance = Math.max(0, balance + totalProfit);
    totalPL += totalProfit;
    if (stopOutIfNeeded()) return;
    render();
    notify(`${closedPositions.length} posisi ditutup · hasil ${money(totalProfit)}`);
  }
  function openPosition(side) {
    const lot = Number($('lots').value);
    if (!Number.isFinite(lot) || lot < 0.01 || lot > 10) { notify('Ukuran posisi harus antara 0.01 dan 10 lot.'); return; }
    if (accountStopped || balance <= 0) { notify('Akun selesai karena stop out. Reset akun untuk mulai lagi.'); return; }
    const price = currentPrice(selectedPair);
    const margin = marginFor(selectedPair, lot);
    const floating = positions.reduce((sum, position) => sum + pnl(position), 0);
    const freeMargin = Math.max(0, balance + floating - usedMargin());
    if (margin > freeMargin) { notify('Saldo tersedia tidak cukup untuk margin simulasi.'); return; }
    const sl = Number($('stopLoss').value) || 0;
    const tp = Number($('takeProfit').value) || 0;
    if (sl && ((side === 'buy' && sl >= price) || (side === 'sell' && sl <= price))) { notify('Stop loss harus berada di sisi yang berlawanan dari harga masuk.'); return; }
    if (tp && ((side === 'buy' && tp <= price) || (side === 'sell' && tp >= price))) { notify('Take profit harus berada di sisi target dari harga masuk.'); return; }
    positions.push({ id: `${Date.now()}-${Math.random()}`, pair: selectedPair, side, lot, open: price, sl, tp, margin });
    render();
    notify(`${side.toUpperCase()} ${selectedPair} ${lot.toFixed(2)} lot dibuka · margin ${money(margin)} dikunci.`);
  }

  Object.entries(PAIRS).forEach(([pair, config]) => {
    const option = document.createElement('option');
    option.value = pair;
    option.textContent = `${pair} · ${config.label}`;
    $('pairSelect').appendChild(option);
  });
  $('pairSelect').value = selectedPair;
  const homeTab = $('homeTab');
  const tradingTab = $('tradingTab');
  const businessTab = $('businessTab');
  const investmentTab = $('investmentTab');
  const homeView = $('homeView');
  const tradingView = $('tradingView');
  const businessView = $('businessView');
  const investmentView = $('investmentView');
  function showView(view) {
    const isHome = view === 'home';
    const isTrading = view === 'trading';
    const isBusiness = view === 'business';
    homeView.hidden = !isHome;
    tradingView.hidden = !isTrading;
    businessView.hidden = !isBusiness;
    investmentView.hidden = view !== 'investment';
    homeTab.classList.toggle('active', isHome);
    tradingTab.classList.toggle('active', isTrading);
    businessTab.classList.toggle('active', isBusiness);
    investmentTab.classList.toggle('active', view === 'investment');
    homeTab.setAttribute('aria-selected', String(isHome));
    tradingTab.setAttribute('aria-selected', String(isTrading));
    businessTab.setAttribute('aria-selected', String(isBusiness));
    investmentTab.setAttribute('aria-selected', String(view === 'investment'));
  }
  homeTab.addEventListener('click', () => showView('home'));
  tradingTab.addEventListener('click', () => showView('trading'));
  businessTab.addEventListener('click', () => showView('business'));
  investmentTab.addEventListener('click', () => showView('investment'));
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  const balanceModal = $('balanceModal');
  $('openBalanceModal').addEventListener('click', () => balanceModal.showModal());
  const authModal = $('authModal');
  $('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabase) {
      $('authMessage').textContent = 'Library Supabase belum termuat. Periksa koneksi internet lalu muat ulang halaman.';
      return;
    }
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    $('authSubmit').disabled = true;
    $('authMessage').textContent = signUpMode ? 'Membuat akun…' : 'Memeriksa login…';
    const result = signUpMode
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    $('authSubmit').disabled = false;
    if (result.error) {
      $('authMessage').textContent = result.error.message;
    } else if (signUpMode && !result.data.session) {
      $('authMessage').textContent = 'Akun dibuat. Periksa email untuk konfirmasi, lalu masuk.';
    } else {
      $('authMessage').textContent = 'Login berhasil, memuat progres…';
    }
  });
  $('authSwitch').addEventListener('click', () => {
    signUpMode = !signUpMode;
    $('authTitle').textContent = signUpMode ? 'Buat akun' : 'Masuk ke game';
    $('authSubmit').textContent = signUpMode ? 'Daftar' : 'Masuk';
    $('authPassword').autocomplete = signUpMode ? 'new-password' : 'current-password';
    $('authSwitch').textContent = signUpMode ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar';
    $('authMessage').textContent = '';
  });
  authModal.addEventListener('cancel', (event) => { if (!cloudUser) event.preventDefault(); });
  $('logoutButton').addEventListener('click', async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) notify(`Gagal keluar: ${error.message}`);
  });
  if (supabase) {
    supabase.auth.onAuthStateChange((_event, session) => { void handleAuthSession(session); });
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) $('authMessage').textContent = error.message;
      void handleAuthSession(data?.session || null);
    });
  } else {
    $('authMessage').textContent = 'Tidak dapat memuat Supabase. Periksa koneksi internet.';
    authModal.showModal();
  }
  $('closeBalanceModal').addEventListener('click', () => balanceModal.close());
  balanceModal.addEventListener('click', (event) => { if (event.target === balanceModal) balanceModal.close(); });
  $('businessCatalog').addEventListener('click', (event) => {
    const button = event.target.closest('[data-buy-business]');
    if (button) buyBusiness(button.dataset.buyBusiness);
  });
  LEVERAGES.forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = `1:${value}`;
    $('leverage').appendChild(option);
  });
  $('leverage').value = String(leverage);
  $('leverage').addEventListener('change', () => {
    leverage = Number($('leverage').value);
    render();
  });
  $('pairSelect').addEventListener('change', () => {
    selectedPair = $('pairSelect').value;
    $('stopLoss').value = '';
    $('takeProfit').value = '';
    renderChart(selectedPair);
    render();
  });
  $('lots').addEventListener('input', render);
  $('depositButton').addEventListener('click', () => transactFunds('deposit'));
  $('withdrawButton').addEventListener('click', () => transactFunds('withdraw'));
  $('buyButton').addEventListener('click', () => openPosition('buy'));
  $('sellButton').addEventListener('click', () => openPosition('sell'));
  $('closeAllButton').addEventListener('click', closeAllPositions);
  $('positionsBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-close]');
    if (button) closePosition(button.dataset.close);
  });
  $('resetButton').addEventListener('click', () => {
    if (!window.confirm('apakah anda yakin ingin mereset akun? akan mulai dari awal lagi')) return;
    balance = 0;
    mainBalance = 10000000;
    totalPL = 0;
    accountStopped = false;
    businessDays = 0;
    ownedBusinesses = [];
    lastGameTick = Date.now();
    persistBusiness();
    leverage = 100;
    $('leverage').value = '100';
    selectedPair = 'XAUUSD';
    $('pairSelect').value = selectedPair;
    $('fundAmount').value = '100000';
    $('lots').value = '0.10';
    $('stopLoss').value = '';
    $('takeProfit').value = '';
    Object.entries(PAIRS).forEach(([pair, config]) => { prices[pair] = config.start; previousPrices[pair] = config.start; });
    positions = [];
    history = [];
    renderChart(selectedPair);
    render();
    renderBusiness();
    updateGameClock();
    notify('Akun demo berhasil direset.');
  });

  persistBusiness();
  showView('home');
  renderChart(selectedPair);
  render();
  renderBusiness();
  updateGameClock();
  setInterval(updateGameClock, 1000);
  setInterval(() => {
    Object.entries(PAIRS).forEach(([pair, config]) => {
      previousPrices[pair] = prices[pair];
      prices[pair] = Math.max(config.start * 0.5, prices[pair] + (Math.random() - 0.5) * config.step);
    });
    if (stopOutIfNeeded()) return;
    const hit = positions.filter((position) => {
      const price = currentPrice(position.pair);
      return (position.sl && (position.side === 'buy' ? price <= position.sl : price >= position.sl)) || (position.tp && (position.side === 'buy' ? price >= position.tp : price <= position.tp));
    });
    hit.forEach((position) => closePosition(position.id, 'stop loss / take profit'));
    render();
  }, 1800);
})();
