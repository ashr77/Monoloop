import { ConnectionStory, Closing, Hero, HowItWorks, ProductIntro } from '@/features/home/HomeSections';
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
          <ProductIntro />
          <ProductShowcase />
        </div>
      </section>

      <ConnectionStory />
      <Closing />
    </>
  );
}
