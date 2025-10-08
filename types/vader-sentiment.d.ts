declare module 'vader-sentiment' {
  export interface SentimentResult {
    compound: number
    pos: number
    neg: number
    neu: number
  }

  export class Sentiment {
    constructor()
    polarity_scores(text: string): SentimentResult
  }
}
