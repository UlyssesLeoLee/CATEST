import { NextResponse } from 'next/server';
import { loginUser } from '../../actions/auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const email = searchParams.get('email') || 'api@catest.test';
  const password = searchParams.get('password') || 'securepassword123';

  try {
    if (action === 'login') {
      const res = await loginUser(email, password);
      return NextResponse.json({ test: 'login', result: res });
    }
    return NextResponse.json({ error: 'Invalid action. Use ?action=login' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
