import { db } from '@/db'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!
    const signature = req.headers.get('x-razorpay-signature') || ''
    const body = await req.text()
    console.log(body);
    

    // Secure signature validation
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex')

    const isValidSignature = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )

    if (!isValidSignature) {
      console.error('Invalid webhook signature')
      return new Response('Invalid signature', { status: 400 })
    }

    const event = JSON.parse(body)
    console.log(event);

    console.log('Webhook event received:', event.event)

    // Use subscription payload for subscription events
    if (
      event.event.startsWith('subscription.') && // e.g. subscription.authenticated, subscription.activated etc
      event.payload?.subscription?.entity
    ) {
      const subscriptionEntity = event.payload.subscription.entity

      const subscriptionId = subscriptionEntity.id
      const customerId = subscriptionEntity.customer_id

      if (!subscriptionId || !customerId) {
        console.error('Missing subscription or customer ID:', { subscriptionId, customerId })
        return new Response('Missing subscription or customer ID', { status: 400 })
      }

      try {
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

        if (!res.ok) {
          throw new Error(`Razorpay API error: ${res.status}`)
        }

        const subscription = await res.json()

        if (!subscription.id || !subscription.plan_id || !subscription.current_end) {
          console.error('Invalid subscription data:', subscription)
          return new Response('Invalid subscription data', { status: 400 })
        }

        // Update user subscription details in your DB
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

        console.log('Successfully updated user subscription:', customerId)
      } catch (apiError) {
        console.error('Error fetching subscription or updating database:', apiError)
        return new Response('Internal server error', { status: 500 })
      }
    } else {
      console.log('Unhandled event type or missing subscription payload:', event.event)
    }

    return new Response(null, { status: 200 })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
