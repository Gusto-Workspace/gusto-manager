import Image from "next/image";
import { useState } from "react";

export default function FaqLandingComponent() {
  const [openIndex, setOpenIndex] = useState(null);
  const faqs = [
    {
      question:
        "Est-ce que Gusto Manager prend une commission sur mes réservations ou ventes ?",
      answer:
        "Non. Contrairement à certaines plateformes, Gusto Manager ne prend aucune commission. Vous gardez 100% de vos revenus, que ce soit sur les réservations, les cartes cadeaux ou les ventes réalisées via votre site.",
    },
    {
      question: "Est-ce compliqué à mettre en place dans mon restaurant ?",
      answer:
        "Non. Gusto Manager est conçu pour être simple à prendre en main. La mise en place est rapide et vous êtes accompagné à chaque étape si nécessaire. Vous pouvez commencer à utiliser la plateforme sans compétence technique.",
    },
    {
      question:
        "Puis-je choisir uniquement les fonctionnalités dont j’ai besoin ?",
      answer:
        "Oui. La plateforme est entièrement modulaire. Vous activez uniquement les fonctionnalités utiles à votre activité (réservations, équipe, HACCP, cartes cadeaux, etc.) et vous pouvez les ajouter ou les retirer à tout moment.",
    },
    {
      question: "Est-ce que Gusto Manager peut remplacer plusieurs outils ?",
      answer:
        "Oui. Gusto Manager regroupe plusieurs outils en une seule plateforme : réservations, gestion d’équipe, fichier client, HACCP, site internet… Cela vous permet de centraliser votre gestion et d’éviter de multiplier les abonnements.",
    },
    {
      question: "Est-ce adapté à mon type de restaurant ?",
      answer:
        "Oui. Que vous soyez un restaurant indépendant, en développement ou avec plusieurs établissements, Gusto Manager s’adapte à votre organisation et évolue avec votre activité.",
    },
    {
      question: "Est-ce que la plateforme fonctionne sur mobile et tablette ?",
      answer:
        "Oui. Gusto Manager est accessible sur ordinateur, tablette et mobile. Vous pouvez gérer votre restaurant où que vous soyez, en temps réel.",
    },
  ];
  return (
    <section className="py-6 tablet:py-12" id="faq">
      <div className="container max-w-[95%] tablet:max-w-[85%] mx-auto border-4 rounded-2xl border-darkBlue p-4 tablet:p-12">
        <div className="flex flex-col tablet:flex-row gap-0 tablet:gap-12 items-center">
          {/* LEFT - VISUEL */}
          <div className="w-full">
            <Image
              src="/img/faq.png"
              alt="Hero"
              width={0}
              height={0}
              sizes="100vw"
              className="w-full h-auto"
            />
          </div>

          {/* RIGHT - FAQ */}
          <div className="flex flex-col gap-2">
            <h2 className="text-balance uppercase text-3xl tablet:text-4xl font-bold text-darkBlue mb-6">
              Foire aux questions
            </h2>
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index;

              return (
                <div
                  key={index}
                  className="border border-darkBlue/10 rounded-xl bg-white overflow-hidden"
                >
                  {/* QUESTION */}
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="w-full text-left p-4 flex justify-between items-center"
                  >
                    <span className="font-semibold text-darkBlue">
                      {faq.question}
                    </span>
                    <span className="text-darkBlue">{isOpen ? "-" : "+"}</span>
                  </button>

                  {/* ANSWER */}
                  <div
                    className={`transition-all duration-300 px-4 ${
                      isOpen ? "max-h-40 pb-4" : "max-h-0"
                    } overflow-hidden`}
                  >
                    <p className="text-darkBlue/80 text-sm">{faq.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
