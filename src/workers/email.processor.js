const { sendMail } = require('../services/mail.service');

const buildBody = (job) => {
  const { type, payload } = job.data;
  switch (type) {
    case 'VERIFY_EMAIL':
      return {
        subject: 'Подтвердите email — LeanStock',
        text: `Здравствуйте, ${payload.username}.\n\nПодтвердите аккаунт по ссылке:\n${payload.link}\n\nСсылка действительна 24 часа.`,
        html: `<p>Здравствуйте, <b>${payload.username}</b>.</p><p><a href="${payload.link}">Подтвердить email</a></p><p>Ссылка действительна 24 часа.</p>`,
      };
    case 'PASSWORD_RESET':
      return {
        subject: 'Сброс пароля — LeanStock',
        text: `Сброс пароля для ${payload.username}:\n${payload.link}\n\nЕсли это не вы, проигнорируйте письмо.`,
        html: `<p>Сброс пароля для <b>${payload.username}</b>.</p><p><a href="${payload.link}">Задать новый пароль</a></p>`,
      };
    case 'LOW_STOCK_ALERT':
      return {
        subject: `Низкий остаток: ${payload.sku} — LeanStock`,
        text: `Товар ${payload.name} (${payload.sku}) на складе «${payload.location}»: остаток ${payload.quantity}, мин. ${payload.minQuantity}.`,
        html: `<p><b>${payload.name}</b> (${payload.sku})</p><p>Склад: ${payload.location}</p><p>Остаток: <b>${payload.quantity}</b>, минимум: ${payload.minQuantity}</p>`,
      };
    case 'TRANSFER_COMPLETE':
      return {
        subject: `Перемещение ${payload.sku} — LeanStock`,
        text: `Перемещено ${payload.quantity} шт. ${payload.name} (${payload.sku}) из «${payload.from}» в «${payload.to}». ID: ${payload.transferId}`,
        html: `<p>Перемещено <b>${payload.quantity}</b> шт. ${payload.name} (${payload.sku})</p><p>Из «${payload.from}» → «${payload.to}»</p><p>ID операции: ${payload.transferId}</p>`,
      };
    case 'WELCOME_MANAGER':
      return {
        subject: 'Доступ менеджера — LeanStock',
        text: `Здравствуйте, ${payload.username}.\n\nВам выдана роль MANAGER в LeanStock.\nВход: ${payload.loginUrl}`,
        html: `<p>Роль <b>MANAGER</b> для ${payload.username}.</p><p><a href="${payload.loginUrl}">Войти</a></p>`,
      };
    case 'PURCHASE_ORDER_CONFIRM':
      return {
        subject: `Заказ поставщику ${payload.poNumber} — LeanStock`,
        text: `PO ${payload.poNumber} для поставщика ${payload.supplier}.\nПозиций: ${payload.totalItems}\n${(payload.lines || [])
          .map((l) => `- ${l.name} (${l.sku}): ${l.quantity} x ${l.unitCost}`)
          .join('\n')}`,
        html: `<p>Заказ <b>${payload.poNumber}</b> → ${payload.supplier}</p><ul>${(payload.lines || [])
          .map((l) => `<li>${l.name} (${l.sku}): ${l.quantity} × ${l.unitCost}</li>`)
          .join('')}</ul>`,
      };
    default:
      return {
        subject: 'LeanStock notification',
        text: JSON.stringify(payload),
      };
  }
};

async function processEmailJob(job) {
  const { to } = job.data;
  const { subject, text, html } = buildBody(job);
  await sendMail({ to, subject, text, html });
}

module.exports = { processEmailJob };
