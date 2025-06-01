import { db } from '@/db'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!
  const signature = req.headers.get('x-razorpay-signature') || ''
  const body = await req.text()

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  if (signature !== expectedSignature) {
    return new Response('Invalid signature', { status: 400 })
  }

  const event = JSON.parse(body)

  if (
    event.event === 'payment.captured' ||
    event.event === 'order.paid'
  ) {
    const entity =
      event.event === 'payment.captured'
        ? event.payload.payment.entity
        : event.payload.order.entity

    const subscriptionId = entity.subscription_id
    const customerId = entity.customer_id

    if (!subscriptionId || !customerId) {
      return new Response('Missing subscription or customer ID', { status: 400 })
    }

    const res = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${subscriptionId}`,
      {
        method: 'GET',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(
              process.env.NEXT_PUBLIC_RAZORPAY_API_KEY + ':' + process.env.RAZORPAY_SECRET
            ).toString('base64'),
        },
      }
    )

    const subscription = await res.json();

    if (!subscription.id || !subscription.plan_id || !subscription.current_end) {
      return new Response('Invalid subscription data', { status: 400 })
    }

    await db.user.update({
      where: {
        razorpayCustomerId: customerId,
      },
      data: {
        razorpaySubscriptionId: subscription.id,
        razorpayPriceId: subscription.plan_id,
        razorpayCurrentPeriodEnd: new Date(subscription.current_end * 1000),
      },
    })
  }

  return new Response(null, { status: 200 })
}
