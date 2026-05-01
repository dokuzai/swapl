"use client";

import { useState } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

interface CheckoutFormProps {
  onSuccess?: () => void;
  returnUrl?: string;
  buttonText?: string;
}

export function CheckoutForm({
  onSuccess,
  returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/checkout/success`,
  buttonText = "Paga ora",
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js non è ancora stato caricato.
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    // Conferma il pagamento o il setup della carta
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    });

    if (error) {
      // Può essere un errore della carta (es. fondi insufficienti) o un errore di validazione
      setErrorMessage(error.message || "Si è verificato un errore inaspettato.");
    } else {
      // Il pagamento è andato a buon fine
      if (onSuccess) {
        onSuccess();
      }
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto w-full">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      
      {errorMessage && (
        <div className="text-red-500 text-sm mt-2">{errorMessage}</div>
      )}

      <button
        disabled={isProcessing || !stripe || !elements}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? "Elaborazione..." : buttonText}
      </button>
    </form>
  );
}
