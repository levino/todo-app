import nodemailer from 'nodemailer'

export type Mailer = {
  send: (message: {
    to: string
    subject: string
    text: string
    html?: string
  }) => Promise<void>
}

export const consoleMailer: Mailer = {
  send: (message) => {
    console.log('========== MAIL (dev) ==========')
    console.log(`To:      ${message.to}`)
    console.log(`Subject: ${message.subject}`)
    console.log('---')
    console.log(message.text)
    console.log('================================')
    return Promise.resolve()
  },
}

export const makeSmtpMailer = (opts: {
  host: string
  port: number
  user: string
  pass: string
  from: string
}): Mailer => {
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465,
    auth: { user: opts.user, pass: opts.pass },
  })
  return {
    send: async (message) => {
      await transporter.sendMail({
        from: opts.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
    },
  }
}

export const makeMailerFromEnv = (env: NodeJS.ProcessEnv): Mailer => {
  if (!env.SES_SMTP_HOST) return consoleMailer
  return makeSmtpMailer({
    host: env.SES_SMTP_HOST,
    port: Number(env.SES_SMTP_PORT ?? 587),
    user: env.SES_SMTP_USER ?? '',
    pass: env.SES_SMTP_PASS ?? '',
    from: env.MAIL_FROM ?? 'Family Todo <noreply@levinkeller.de>',
  })
}
