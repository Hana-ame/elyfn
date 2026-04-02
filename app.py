import asyncio
from grpc_remote_control.grpc_controller import get_mouse_position, move_mouse, click_mouse

# from server import main

def get_data(x:float,y:float,z:float,alpha:float,beta:float,gamma:float):
    print(f"Received data: x={x}, y={y}, z={z}, alpha={alpha}, beta={beta}, gamma={gamma}")



# if __name__ == "__main__":
#     try:
#         asyncio.run(main())
#     except KeyboardInterrupt:
#         print("\n服务器正在关闭。")