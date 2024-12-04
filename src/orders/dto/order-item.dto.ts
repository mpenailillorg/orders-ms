import { IsNumber, IsPositive } from "class-validator";

export class OrderItemDto {

    @IsNumber()
    @IsPositive()
    productId: number; // desde la base de datos de productos

    @IsNumber()
    @IsPositive()
    quantity: number;

    @IsNumber()
    @IsPositive()
    price: number;
}