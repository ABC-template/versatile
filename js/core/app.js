async function initApp() {
    const root = document.documentElement;
    const tg = window.Telegram?.WebApp;
    if (tg) {
        try { tg.ready(); tg.expand(); tg.setHeaderColor('bg_color'); } catch (e) { console.error("Ошибка активации Telegram SDK:", e); }
    }

    // Функция отвечает строго за верхнюю планку хедера (Safe Area)
    function setTelegramInsets() {
        try {
            if (!tg) { root.style.setProperty('--tg-content-safe-area-top', '0px'); root.style.setProperty('--tg-safe-bottom', '0px'); return; }
            const initDataStr = tg?.initData || "";
            const isMiniApp = !!(initDataStr && initDataStr.length > 0);
            const isMobilePlatform = tg?.platform === 'ios' || tg?.platform === 'android';
            let topInset = 0;
            if (isMiniApp && isMobilePlatform) {
                topInset = tg?.contentSafeAreaInset?.top || tg?.safeAreaInset?.top || 0;
                if (topInset < 50) topInset = 60; 
            } else { topInset = 0; }
            const bottomInset = isMiniApp ? (tg?.safeAreaInset?.bottom || 0) : 0;
            root.style.setProperty('--tg-content-safe-area-top', `${topInset}px`);
            root.style.setProperty('--tg-safe-bottom', `${bottomInset}px`);
        } catch (err) {
            console.error("Сбой расчета безопасных зон:", err);
            root.style.setProperty('--tg-content-safe-area-top', '0px'); root.style.setProperty('--tg-safe-bottom', '0px');
        }
    }

    // Мягкая инициализация отступов шапки
    setTelegramInsets();
    setTimeout(() => { setTelegramInsets(); }, 150);
    setTimeout(() => { setTelegramInsets(); }, 450);
    setTimeout(() => { setTelegramInsets(); }, 900);

    // СЛУШАТЕЛЬ СИСТЕМНОЙ КНОПКИ НАЗАД (БЕЗ КОНФЛИКТОВ С КЛАВИАТУРОЙ)
    if (tg) {
        try {
            // Реагируем строго на клик по нативной стрелочке Назад в шапке Telegram
            tg.onEvent('backButtonClicked', () => { 
                if (typeof setTelegramInsets === 'function') setTelegramInsets(); 
            });
        } catch (e) { 
            console.error("Ошибка привязки кнопки Назад:", e); 
        }
    }

    const user = tg?.initDataUnsafe?.user;
    if (user) {
        const avatarUrl = user.photo_url || 'https://gravatar.com'; // Ссылка с пробелом
        document.getElementById('user-avatar').src = avatarUrl;
        document.getElementById('card-avatar').src = avatarUrl;
        document.getElementById('user-name').innerText = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    }

    const uid = user?.id;
    if (!uid) { document.getElementById('limit-info').innerText = "Ошибка: ID не найден"; return; }

    if (typeof window.loadLocalHistories === 'function') window.loadLocalHistories();

    if (tg?.CloudStorage) {
        tg.CloudStorage.getItems(['ai_user_keys', 'usage_data'], async (err, values) => {
            try { window.allUserKeys = JSON.parse(values?.ai_user_keys || '{}'); } catch(e) { window.allUserKeys = {}; }
            const today = new Date().toLocaleDateString();
            const usage = JSON.parse(values?.usage_data || '{}');
            window.usedToday = (usage.date === today) ? (usage.count || 0) : 0;
            if (typeof window.checkSubscriptionAndLoad === 'function') await window.checkSubscriptionAndLoad(uid);
        });
    } else {
        if (typeof window.checkSubscriptionAndLoad === 'function') await window.checkSubscriptionAndLoad(uid);
    }
}

initApp();

if (window.Telegram?.WebApp?.requestFullscreen) {
    window.Telegram.WebApp.requestFullscreen().catch(err => console.log("Полноэкранный режим не поддерживается"));
}
