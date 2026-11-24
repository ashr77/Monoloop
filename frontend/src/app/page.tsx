import { Reveal } from '@/components/motion';
import { ConnectionStory, Closing, Hero, HowItWorks } from '@/features/home/HomeSections';
import { LivePulse } from '@/features/home/LivePulse';
import { ProductShowcase } from '@/features/home/ProductShowcase';

export default function HomePage() {
  return (
    <>
      <Hero />
      <LivePulse />
      <HowItWorks />

      <section aria-labelledby="product-heading">
        <div className="page-shell py-20 lg:py-28">
          <Reveal className="mb-14 grid gap-6 lg:grid-cols-12">
            <p className="t-eyebrow lg:col-span-3">The product</p>
            <div className="space-y-4 lg:col-span-9">
              <h2 id="product-heading" className="text-display-md font-medium">
                One workspace for both sides of the exchange.
              </h2>
              <p className="max-w-2xl text-[15px] leading-relaxed text-slate-700">
                These are the working Meguri views, rendered with live data from the platform. Every company account can both
                supply and buy.
              </p>
            </div>
          </Reveal>
          <ProductShowcase />
        </div>
      </section>

      <ConnectionStory />
      <Closing />
    </>
  );
}
