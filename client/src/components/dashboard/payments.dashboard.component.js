import { useState } from "react";

export default function PaymentsDashboardComponent(props) {
  const [selectedOption, setSelectedOption] = useState("payouts");

  const handleOptionChange = (event) => {
    setSelectedOption(event.target.value);
  };

  return (
    <div className="bg-white drop-shadow-sm rounded-lg p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        
        <select
          value={selectedOption}
          onChange={handleOptionChange}
          className="border rounded-lg p-2"
        >
          <option value="payouts">Détails des Virements</option>
          <option value="payments">Détails des Paiements</option>
        </select>
      </div>

      {selectedOption === "payouts" && (
        <div>
          <p>Data virements</p>
        </div>
      )}

      {selectedOption === "payments" && (
        <div className="flex flex-col gap-4">
          {props.transactions && props.transactions.length > 0 ? (
            props.transactions.map((transaction, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex flex-col">
                  <p className="font-medium">
                    Date :{" "}
                    {new Date(transaction.date * 1000).toLocaleDateString()}
                  </p>
                  <p>Client : {transaction.customer || "Inconnu"}</p>
                  <p>Montant payé : {transaction.grossAmount} €</p>
                  <p>Frais Stripe : {transaction.feeAmount} €</p>
                  <p>Montant net : {transaction.netAmount} €</p>
                </div>
                <button
                  className="bg-red text-white py-1 px-3 rounded-lg"
                  onClick={() =>
                    console.log(`Remboursement de ${transaction.id}`)
                  }
                >
                  Rembourser
                </button>
              </div>
            ))
          ) : (
            <p>Aucune transaction trouvée</p>
          )}
        </div>
      )}
    </div>
  );
}
