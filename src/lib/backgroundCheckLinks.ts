export const BACKGROUND_CHECK_LINKS = [
  {
    id: "judicial",
    label: "Antecedentes Judiciales",
    url: "https://antecedentes.policia.gov.co:7005/WebJudicial/",
  },
  {
    id: "procuraduria",
    label: "Antecedentes Procuraduría",
    url: "https://www.procuraduria.gov.co/Pages/Generacion-de-antecedentes.aspx",
  },
  {
    id: "simit",
    label: "Multas SIMIT",
    url: "https://www.fcm.org.co/simit/#/home-public",
  },
] as const;

export type BackgroundCheckId = (typeof BACKGROUND_CHECK_LINKS)[number]["id"];
