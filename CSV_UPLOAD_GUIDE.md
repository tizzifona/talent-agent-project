# 🎯 Talent Agent - CSV File Upload Version

## ✨ Обновления

### Новая функция: Загрузка CSV файлов

Теперь **не нужны** hardcoded данные! Пользователь может:
- ✅ Загрузить **до 10 CSV файлов** прямо в браузере
- ✅ **Автоматическое определение** структуры (email, phone, name)
- ✅ Работает с **любыми** CSV файлами
- ✅ Вся обработка на стороне daemon (безопасно)

---

## 📤 Как использовать

### 1. Запустите приложение из Web Daemon
- URL: https://tizzifona.github.io/talent-agent-project/index.html
- Daemon: https://3ba317.magicid.cloud

### 2. Загрузите CSV файлы
1. Нажмите **"📤 Select CSV Files"**
2. Выберите до 10 CSV файлов
3. Приложение покажет:
   - Имя файла
   - Размер
   - Количество строк

### 3. Настройте параметры
- **Fuzzy Name Threshold**: 50-100% (default: 85%)
- **Auto-merge Confidence**: High/Medium/All

### 4. Запустите дедупликацию
- Нажмите **"🚀 Run Deduplication"**
- Подождите обработки
- Посмотрите результаты

### 5. Экспортируйте результаты
- Нажмите **"📥 Export Results (CSV)"**
- Получите файл с объединенными записями

---

## 🔍 Автоопределение полей

Приложение **автоматически** находит:

**Email поля:**
- `email`, `email_address`, `contact_email`, `work_email`
- `primary_email`, `e-mail`, `email_primary`

**Phone поля:**
- `phone`, `mobile`, `telephone`, `phone_number`
- `phone_mobile`, `contact_phone`, `office_phone`

**Name поля:**
- First name: `first_name`, `firstname`, `first`, `given_name`
- Last name: `last_name`, `lastname`, `last`, `surname`
- Full name: `full_name`, `fullname`, `name`, `attendee_name`

---

## 📊 Алгоритм дедупликации

### Порядок matching:

1. **Exact Email Match** (100% confidence)
   - Exact match после нормализации

2. **Exact Phone Match** (95% confidence)
   - Только цифры, 10+ символов

3. **Fuzzy Name Match** (70-90% confidence)
   - Levenshtein distance
   - Настраиваемый threshold

4. **Manual Review**
   - Низкая уверенность

5. **Held Out**
   - Нет совпадений

---

## 📈 Результаты

Вы получите:
- **Total Records**: Всего записей
- **Unique Persons**: Уникальных персон
- **Email Matches**: Совпадений по email
- **Phone Matches**: Совпадений по phone
- **Fuzzy Matches**: Нечетких совпадений
- **Manual Review**: Требует ручной проверки
- **Held Out**: Без совпадений

---

## 💡 Примеры использования

### Пример 1: HR система + LinkedIn + Конференции

```
Файлы:
1. hr_employees.csv (250 строк)
2. linkedin_contacts.csv (180 строк)
3. conference_2024.csv (95 строк)

Результат:
- Total: 525 records
- Unique: 312 persons
- Email matches: 145
- Phone matches: 68
```

### Пример 2: Multiple источники продаж

```
Файлы:
1. salesforce_leads.csv
2. hubspot_contacts.csv
3. mailchimp_subscribers.csv
4. eventbrite_attendees.csv

Threshold: 85%
Auto-merge: High confidence

Результат: автоматическая дедупликация с provenance
```

---

## 🎨 Что делать с результатами?

### Export CSV содержит:

| Column | Description |
|--------|-------------|
| Person ID | Уникальный ID персоны |
| Primary Name | Основное имя |
| Primary Email | Основной email |
| Primary Phone | Основной телефон |
| Match Type | Тип совпадения |
| Confidence | Уверенность (%) |
| Record Count | Сколько записей объединено |
| Provenance | Источники (`file.csv:row`) |
| All Emails | Все найденные emails |
| All Phones | Все найденные телефоны |

---

## 🤖 AI Assistant

Задайте вопросы:
- "Почему эти записи совпали?"
- "Должен ли я увеличить threshold?"
- "Покажи записи с низкой уверенностью"
- "Какие проблемы с качеством данных?"

---

## 🔐 Безопасность

- ✅ Все файлы обрабатываются **в вашем daemon**
- ✅ Данные **не покидают** вашу инфраструктуру
- ✅ Нет отправки на внешние серверы
- ✅ Token-based аутентификация
- ✅ Scoped permissions

---

## 🚀 Обновления

**v2.0** (текущая версия):
- ✅ Загрузка CSV файлов (до 10)
- ✅ Автоопределение структуры
- ✅ Работает с любыми CSV
- ✅ Улучшенный UI

**v1.0**:
- Hardcoded тестовые данные
- 7 фиксированных баз

---

## 📝 Known Issues

1. **Очень большие файлы** (>10MB) могут загружаться медленно
2. **Сложные CSV** с многострочными ячейками могут парситься неправильно
3. **Специальные символы** в именах файлов могут вызывать проблемы

---

## 💬 Обратная связь

Если что-то не работает:
1. Проверьте консоль браузера (F12)
2. Убедитесь что файлы в формате CSV
3. Проверьте что файлы содержат заголовки
4. Попробуйте с меньшим файлом

---

**Готово к использованию!** 🎉

После обновления GitHub Pages (1-2 минуты), переустановите app в daemon и попробуйте загрузить свои CSV файлы!
