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
 
    // Handle subscription.authenticated event
    if (event.event === 'subscription.authenticated' && event.payload?.subscription?.entity) {
      const subscriptionEntity = event.payload.subscription.entity
      const customerId = subscriptionEntity.notes.customerId
      const subscriptionId = subscriptionEntity.id
      const planId = subscriptionEntity.plan_id

      console.log('Processing subscription.authenticated:', {
        subscriptionId,
        customerId,
        planId,
        status: subscriptionEntity.status
      })

      if (!customerId || !subscriptionId || !planId) {
        console.error('Missing required subscription data:', {
          customerId,
          subscriptionId,
          planId
        })
        return new Response('Missing subscription data', { status: 400 })
      }

      try {
        // Calculate period end based on start_at and plan duration
        // For now, we'll use a default period (you might want to fetch plan details for accurate duration)
        const startAt = subscriptionEntity.start_at || subscriptionEntity.charge_at
        const periodEnd = new Date((startAt + (30 * 24 * 60 * 60)) * 1000) // Default 30 days, adjust based on your plan

        // Update user subscription details in your DB
        const updatedUser = await db.user.update({
          where: {
            razorpayCustomerId: customerId,
          },
          data: {
            razorpaySubscriptionId: subscriptionId,
            razorpayPriceId: planId,
            razorpayCurrentPeriodEnd: periodEnd,
          },
        })

        console.log('Successfully updated user subscription:', {
          userId: updatedUser.id,
          customerId,
          subscriptionId,
          planId
        })

      } catch (dbError) {
        console.error('Database update error for subscription.authenticated:', dbError)
        return new Response('Database error', { status: 500 })
      }
    }
    
    // Handle subscription.activated event (when first payment is successful)
    else if (event.event === 'subscription.activated' && event.payload?.subscription?.entity) {
      const subscriptionEntity = event.payload.subscription.entity
      // Get customerId from notes instead of customer_id (which is null)
      const customerId = subscriptionEntity.notes?.customerId
      const subscriptionId = subscriptionEntity.id
      const currentEnd = subscriptionEntity.current_end

      console.log('Processing subscription.activated:', {
        subscriptionId,
        customerId,
        currentEnd
      })

      if (currentEnd && customerId) {
        try {
          await db.user.update({
            where: {
              razorpayCustomerId: customerId,
            },
            data: {
              razorpayCurrentPeriodEnd: new Date(currentEnd * 1000),
            },
          })

          console.log('Successfully updated subscription period end for customer:', customerId)
        } catch (dbError) {
          console.error('Database update error for subscription.activated:', dbError)
        }
      } else {
        console.error('Missing customerId or currentEnd in subscription.activated:', {
          customerId,
          currentEnd
        })
      }
    }
    
    // Handle subscription.charged event (recurring payments)
    else if (event.event === 'subscription.charged' && event.payload?.subscription?.entity) {
      const subscriptionEntity = event.payload.subscription.entity
      // Get customerId from notes instead of customer_id (which might be null)
      const customerId = subscriptionEntity.notes?.customerId || subscriptionEntity.customer_id
      const currentEnd = subscriptionEntity.current_end

      console.log('Processing subscription.charged:', {
        subscriptionId: subscriptionEntity.id,
        customerId,
        currentEnd
      })

      if (currentEnd && customerId) {
        try {
          await db.user.update({
            where: {
              razorpayCustomerId: customerId,
            },
            data: {
              razorpayCurrentPeriodEnd: new Date(currentEnd * 1000),
            },
          })

          console.log('Successfully updated subscription after charge for customer:', customerId)
        } catch (dbError) {
          console.error('Database update error for subscription.charged:', dbError)
        }
      }
    }
    
    // Handle subscription.cancelled event
    else if (event.event === 'subscription.cancelled' && event.payload?.subscription?.entity) {
      const subscriptionEntity = event.payload.subscription.entity
      // Get customerId from notes instead of customer_id (which might be null)
      const customerId = subscriptionEntity.notes?.customerId || subscriptionEntity.customer_id

      console.log('Processing subscription.cancelled for customer:', customerId)

      if (customerId) {
        try {
          await db.user.update({
            where: {
              razorpayCustomerId: customerId,
            },
            data: {
              razorpaySubscriptionId: null,
              razorpayPriceId: null,
              razorpayCurrentPeriodEnd: null,
            },
          })

          console.log('Successfully cancelled subscription for customer:', customerId)
        } catch (dbError) {
          console.error('Database update error for subscription.cancelled:', dbError)
        }
      }
    }
    
    // Handle legacy payment.authorized event (for backward compatibility)
    else if (event.event === 'payment.authorized' && event.payload?.payment?.entity) {
      const paymentEntity = event.payload.payment.entity
      const orderId = paymentEntity.order_id
      const customerId = paymentEntity.customer_id

      console.log('Processing legacy payment.authorized event:', { orderId, customerId })

      if (!orderId) {
        console.error('Missing order ID in payment:', paymentEntity.id)
        return new Response('Missing order ID', { status: 400 })
      }

      // Your existing payment.authorized logic here if needed for one-time payments
      console.log('Legacy payment processing - consider migrating to subscription events')
    }
    
    else {
      console.log('Unhandled event type:', event.event)
    }
 
    return new Response(null, { status: 200 }) 
  } catch (error) { 
    console.error('Webhook processing error:', error) 
    return new Response('Internal server error', { status: 500 }) 
  } 
}