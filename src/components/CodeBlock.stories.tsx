import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CodeBlock from "./CodeBlock";

const meta = {
  title: "Components/CodeBlock",
  component: CodeBlock,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IframeSnippet: Story = {
  args: {
    code: `<iframe id="eczane-widget-kktc" src="https://acikeczanevarmi.com/embed/kktc"
        title="KKTC nöbetçi eczaneler"
        style="width:100%;height:420px;border:0"></iframe>
<p><a href="https://acikeczanevarmi.com">Kaynak: acikeczanevarmi.com</a></p>`,
    copy: "Kodu kopyala",
    copied: "Kopyalandı",
  },
};

// The height-sync snippet: a <script> block, tokenised by the JS pass
// instead of the tag pass.
export const ScriptSnippet: Story = {
  args: {
    code: `<script>
addEventListener('message',function(e){
  if(e.origin!=='https://acikeczanevarmi.com'||!e.data||!e.data.acikeczanevarmi)return;
  var f=document.getElementById('eczane-widget');
  if(f)f.style.height=e.data.height+'px';
});
</script>`,
    copy: "Kodu kopyala",
    copied: "Kopyalandı",
  },
};

// Without a `copy` label the corner button is omitted entirely.
export const NoCopyButton: Story = {
  args: {
    code: `<p>Read-only, nothing to copy.</p>`,
  },
};
