import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  debug: true, // Show debug info in console
  logger: true // Show log info in console
});

export const sendVerificationEmail = async (email: string, code: string) => {
  const mailOptions = {
    from: `"CATEST" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your Login Verification Code',
    text: `Your verification code is: ${code}. It expires in 5 minutes.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Login Verification</h2>
        <p>Your verification code for CATEST is:</p>
        <h1 style="color: #4F46E5; letter-spacing: 4px;">${code}</h1>
        <p style="color: #666; font-size: 14px;">This code will expire in 5 minutes.</p>
        <hr style="border: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">If you did not request this code, please ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};
