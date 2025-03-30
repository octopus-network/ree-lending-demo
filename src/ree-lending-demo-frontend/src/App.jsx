import { useState, useEffect } from "react";
import { ree_lending_demo_backend } from "declarations/ree-lending-demo-backend";
import { Button } from "./components/ui/button";
import { Topbar } from "./components/topbar";

function App() {
  const [poolList, setPoolList] = useState([]);

  useEffect(() => {
    ree_lending_demo_backend
      .get_pool_list({
        from: [],
        limit: 20,
      })
      .then((res) => {
        console.log("pool_list", res);
      });
  }, []);

  // const [greeting, setGreeting] = useState("");

  // function handleSubmit(event) {
  //   event.preventDefault();
  //   const name = event.target.elements.name.value;
  //   ree_lending_demo_backend.greet(name).then((greeting) => {
  //     setGreeting(greeting);
  //   });
  //   return false;
  // }
  return (
    <div className="flex flex-col">
      <Topbar />
      {/* <main>
        <form action="#" onSubmit={handleSubmit}>
          <label htmlFor="name">Enter your name: &nbsp;</label>
          <input id="name" alt="Name" type="text" />
          <Button type="submit">Click Me!</Button>
        </form>
        <section id="greeting">{greeting}</section>
      </main> */}
    </div>
  );
}

export default App;
