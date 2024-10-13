import Link from "next/link";

// I18N
import { useTranslation } from "next-i18next";

// DATA
import { footerData } from "@/_assets/data/_index.data";

export default function FooterComponent() {
  const { t } = useTranslation("common");
  return (
    <footer className="bg-darkBlue mt-[25px] rounded-t-[30px] desktop:rounded-t-[50px] pt-4 desktop:pt-[50px]">
      <div
        className="bg-cover bg-no-repeat bg-center h-[470px] rounded-[30px] desktop:rounded-[50px] relative flex justify-center items-center max-w-[95%] mx-auto px-6"
        style={{ backgroundImage: `url(/img/top-footer.webp)` }}
      >
        <div className="flex flex-col justify-center items-center text-white gap-6 h-fit ">
          <h2 className="uppercase font-extralight">
            {t("footer.join.young")}
          </h2>

          <h1 className="font-bold text-center text-pretty text-3xl desktop:text-6xl">
            {t("footer.join.title")}
          </h1>

          <p className="font-thin text-lg max-w-[550px] text-center">
            {t("footer.join.subtitle")}
          </p>

          <Link href="/sign-up">
            <a className="bg-darkBlue font-semibold rounded-[15px] px-4 py-2">
              {t("footer.join.inscription")}
            </a>
          </Link>
        </div>
      </div>

      <div className="flex flex-col desktop:flex-row justify-evenly pt-[100px] pb-[75px]">
        <div className="flex flex-col text-center gap-4 text-white pt-[50px] order-1 desktop:order-none w-full desktop:w-1/3">
          {footerData.left.map((data, i) => {
            return (
              <Link key={i} href={data.link}>
                <a>{t(data.title)}</a>
              </Link>
            );
          })}
        </div>

        <div className="flex flex-col items-center justify-center gap-4 order-0 desktop:order-none w-full desktop:w-1/3">
          <Link href="/">
            <a>
              <img
                src="/img/logo-1.png"
                draggable={false}
                alt="logo"
                className="max-w-[260px]"
              />
            </a>
          </Link>

          <div className="flex gap-4">
            {footerData.social.map((social, i) => {
              return (
                <Link key={i} href={social.link}>
                  <a>
                    <img
                      src={social.icon}
                      alt="social"
                      draggable={false}
                      className="w-[30px]"
                    />
                  </a>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col text-center gap-4 text-white pt-[50px] w-full desktop:w-1/3">
          {footerData.right.map((data, i) => {
            return (
              <Link key={i} href={data.link}>
                <a>{t(data.title)}</a>
              </Link>
            );
          })}
        </div>
      </div>

      <hr className="text-white opacity-15 max-w-[95%] mx-auto" />

      <p className="text-white text-center py-[20px] text-sm font-thin">
        {t("footer.main.reserved")}
      </p>
    </footer>
  );
}
