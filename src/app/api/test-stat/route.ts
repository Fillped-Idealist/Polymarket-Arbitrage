import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Statistics API is working',
    data: {
      test: true
    }
  });
}
