/**
 * 3CX Voice Handler
 * Handles 3CX CRM integration requests.
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asDualHandler } from '../utils/dual-handler';

const expressHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const phoneNumber = req.query.Number as string;
    console.log(`3CX Lookup for: ${phoneNumber}`);

    // Simple 3CX CRM lookup response
    res.status(200).json({
      ContactID: uuidv4(),
      FirstName: 'FirstLine',
      LastName: 'Patient',
      Phone: phoneNumber,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const handler = asDualHandler(expressHandler);
