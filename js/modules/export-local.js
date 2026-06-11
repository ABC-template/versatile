// js/modules/export-local.js

// Экспорт локального архива (доступен всем пользователям)
window.exportLocalArchive = async function() {
  console.log("📦 Начинаем экспорт локального архива...");
  
  if (!window.chatHistories || Object.keys(window.chatHistories).length === 0) {
    if (window.tg?.showAlert) {
      window.tg.showAlert("Нет данных для экспорта");
    } else {
      alert("Нет данных для экспорта");
    }
    return;
  }
  
  // Показываем индикатор загрузки
  const loadingMsg = window.tg?.showPopup ? 
    window.tg.showPopup({ title: "Экспорт", message: "Подготовка архива...", buttons: [] }) : 
    console.log("Подготовка архива...");
  
  try {
    // Собираем все чаты из localStorage
    const exportData = {
      chatHistories: window.chatHistories,
      topicNames: window.topicNames,
      exportDate: new Date().toISOString(),
      appVersion: "1.0.0"
    };
    
    // Отправляем запрос на сервер для обработки (разбивка на части, если нужно)
    const response = await fetch('/api/chats/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(exportData)
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || "Ошибка экспорта");
    }
    
    // Если архив разбит на части, собираем все части
    if (data.total_parts > 1) {
      await window.downloadMultiPartArchive(data);
    } else {
      // Скачиваем один файл
      window.downloadJSON(data.archive, `versatile_ai_local_archive_${data.total_messages}_messages.json`);
    }
    
    if (window.tg?.showAlert) {
      window.tg.showAlert(`✅ Архив успешно создан! Скачано ${data.total_messages} сообщений.`);
    } else {
      console.log(`✅ Архив успешно создан! Скачано ${data.total_messages} сообщений.`);
    }
    
  } catch (err) {
    console.error("Ошибка экспорта локального архива:", err);
    
    // Fallback: прямой экспорт без сервера (для маленьких объемов)
    try {
      console.log("Пробуем прямой экспорт через браузер...");
      const fallbackArchive = [];
      for (const [topicId, chats] of Object.entries(window.chatHistories)) {
        for (const chat of chats) {
          fallbackArchive.push({
            chat_id: chat.id,
            title: chat.title,
            topic_id: topicId,
            topic_name: window.topicNames[topicId] || topicId,
            messages: chat.messages || []
          });
        }
      }
      window.downloadJSON(fallbackArchive, `versatile_ai_local_archive_fallback.json`);
      
      if (window.tg?.showAlert) {
        window.tg.showAlert("⚠️ Архив создан в упрощенном формате. Некоторые данные могут отсутствовать.");
      }
    } catch (fallbackErr) {
      console.error("Fallback экспорт тоже не удался:", fallbackErr);
      if (window.tg?.showAlert) {
        window.tg.showAlert("❌ Не удалось создать архив. Попробуйте позже.");
      }
    }
  }
};

// Скачивание многокомпонентного архива (несколько частей)
window.downloadMultiPartArchive = async function(firstPart) {
  const totalParts = firstPart.total_parts;
  const allArchiveParts = [firstPart.archive];
  
  console.log(`📦 Скачиваю архив из ${totalParts} частей...`);
  
  // Загружаем остальные части
  for (let part = 2; part <= totalParts; part++) {
    const response = await fetch('/api/chats/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Part': part.toString()
      },
      body: JSON.stringify({
        chatHistories: window.chatHistories,
        topicNames: window.topicNames,
        exportOptions: { part: part.toString() }
      })
    });
    
    const partData = await response.json();
    if (partData.success && partData.archive) {
      allArchiveParts.push(partData.archive);
    } else {
      console.warn(`Часть ${part} не загрузилась`);
    }
  }
  
  // Объединяем все части
  const fullArchive = allArchiveParts.flat();
  
  // Скачиваем объединенный архив
  window.downloadJSON(fullArchive, `versatile_ai_local_archive_full_${fullArchive.length}_chats.json`);
};

// Скачивание JSON файла
window.downloadJSON = function(data, filename) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Экспорт облачного архива (только для PRO)
window.exportCloudArchive = async function() {
  if (!window.config.syncEnabled) {
    if (window.tg?.showAlert) {
      window.tg.showAlert("Облачный архив доступен только для PRO-пользователей.\n\nИспользуйте 'Экспорт локального архива' для сохранения данных.");
    }
    return;
  }
  
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) {
    console.error("Нет данных авторизации");
    return;
  }
  
  try {
    const response = await fetch('/api/chats/export', {
      method: 'GET',
      headers: {
        'X-Telegram-Init-Data': initData
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      if (data.fallbackToLocal) {
        // Предлагаем использовать локальный экспорт
        if (window.tg?.showConfirm) {
          window.tg.showConfirm(
            "Облачный архив временно недоступен. Скачать локальный архив?",
            (ok) => { if (ok) window.exportLocalArchive(); }
          );
        }
      } else {
        throw new Error(data.error || "Ошибка экспорта");
      }
      return;
    }
    
    if (data.total_parts > 1) {
      // Облачный архив разбит на части
      await window.downloadMultiPartCloudArchive(data);
    } else {
      // Скачиваем один файл
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      link.download = `versatile_ai_cloud_archive_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    }
    
    if (data.grace_period_days_left !== null && data.grace_period_days_left > 0) {
      if (window.tg?.showAlert) {
        window.tg.showAlert(`⚠️ Ваши данные будут удалены через ${data.grace_period_days_left} дней. Сохраните архив в надежном месте.`);
      }
    }
    
  } catch (err) {
    console.error("Ошибка экспорта облачного архива:", err);
    if (window.tg?.showAlert) {
      window.tg.showAlert("Не удалось загрузить облачный архив. Проверьте подключение к интернету.");
    }
  }
};

// Добавляем кнопки экспорта в интерфейс (вызывать при загрузке)
window.initExportButtons = function() {
  // Ищем контейнер для кнопок экспорта (например, в профиле)
  const exportContainer = document.getElementById('export-buttons-container');
  if (!exportContainer) {
    // Создаем контейнер, если его нет
    const profileTab = document.getElementById('tab-profile');
    if (profileTab) {
      const container = document.createElement('div');
      container.id = 'export-buttons-container';
      container.style.cssText = 'margin-top: 16px; display: flex; flex-direction: column; gap: 8px;';
      container.innerHTML = `
        <button class="btn" style="background: var(--secondary-bg); color: var(--text-color);" onclick="window.exportLocalArchive()">💾 Экспорт локального архива</button>
        <button class="btn" id="cloud-export-btn" style="background: var(--secondary-bg); color: var(--text-color);" onclick="window.exportCloudArchive()">☁️ Экспорт облачного архива (PRO)</button>
      `;
      profileTab.appendChild(container);
    }
  }
  
  // Обновляем видимость кнопки облачного экспорта в зависимости от статуса PRO
  const cloudBtn = document.getElementById('cloud-export-btn');
  if (cloudBtn) {
    if (window.config.syncEnabled) {
      cloudBtn.style.display = 'block';
      cloudBtn.innerText = '☁️ Экспорт облачного архива (PRO)';
    } else {
      cloudBtn.style.display = 'block';
      cloudBtn.innerText = '🔒 Облачный архив (доступен по PRO подписке)';
      cloudBtn.style.opacity = '0.6';
    }
  }
};
