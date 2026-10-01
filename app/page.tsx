import Landing from "@/components/Landing";
import About from "@/components/About";
import Gallery from "@/components/Gallery";
import Friends from "@/components/Friends";
import Footer from "@/components/Footer";
import BlockScaleWrapper from "@/components/BlockScaleWrapper";
import SlotWheelTransition from "@/components/SlotWheelTransition";

export default function Home() {
  return (
    <main className="w-full bg-ink">
      <SlotWheelTransition>
        {/* Block 1: Landing */}
        <BlockScaleWrapper designHeight={1024} origin="center" mode="cover" backgroundColor="#101010">
          <Landing />
        </BlockScaleWrapper>

        {/* Block 2: About（人设 + 三类收藏） */}
        <About />

        {/* Block 3: Gallery（首页只显示 3 张，完整版见 /gallery） */}
        <Gallery limit={3} />

        {/* Block 4: Friends（友链堆叠展示） */}
        <Friends />

        {/* Block 5: Footer（单独做响应式，确保 Lonely 大字和联系信息都可见） */}
        <Footer />
      </SlotWheelTransition>
    </main>
  );
}
