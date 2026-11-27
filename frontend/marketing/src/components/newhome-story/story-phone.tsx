import Image from "next/image";

/** Full phone: the Manifest overview screenshot in a dark device frame. */
export function StoryPhone() {
  return (
    <div className="ns-device-full">
      <Image
        src="/newhome/manifest-overview-phone.png"
        alt="Consciously app screen"
        width={780}
        height={1688}
        sizes="312px"
      />
    </div>
  );
}
