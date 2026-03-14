import { redirect } from 'next/navigation';

export default function Home() {
  // Always redirect to login; the login page will handle the session check
  redirect('/login');
}
